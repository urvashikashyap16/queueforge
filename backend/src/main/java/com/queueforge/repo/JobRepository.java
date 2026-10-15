package com.queueforge.repo;

import com.queueforge.domain.Job;
import com.queueforge.domain.JobStatus;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Types;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * All job state transitions are single SQL statements guarded by a WHERE clause
 * on the expected current state. That makes every transition atomic without
 * application-level locks, and it is safe with any number of worker instances.
 */
@Repository
public class JobRepository {

    static final RowMapper<Job> JOB_MAPPER = (rs, i) -> new Job(
            Sql.uuid(rs, "id"),
            rs.getString("queue"),
            rs.getString("type"),
            rs.getString("payload"),
            rs.getInt("priority"),
            JobStatus.valueOf(rs.getString("status")),
            rs.getInt("attempts"),
            rs.getInt("max_attempts"),
            Sql.ts(rs, "run_at"),
            rs.getString("locked_by"),
            Sql.ts(rs, "locked_until"),
            rs.getString("last_error"),
            rs.getString("idempotency_key"),
            Sql.uuid(rs, "schedule_id"),
            Sql.ts(rs, "created_at"),
            Sql.ts(rs, "started_at"),
            Sql.ts(rs, "finished_at"),
            Sql.ts(rs, "updated_at"));

    private final NamedParameterJdbcTemplate jdbc;

    public JobRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record NewJob(String queue, String type, String payloadJson, int priority, int maxAttempts,
                         Instant runAt, String idempotencyKey, UUID scheduleId) {
    }

    public record InsertResult(Job job, boolean created) {
    }

    /**
     * Idempotent insert: if a job with the same idempotency key already exists,
     * ON CONFLICT DO NOTHING returns no row and we return the existing job instead.
     * This is race-free even when two requests with the same key arrive together.
     */
    public InsertResult insert(NewJob n) {
        MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("id", UUID.randomUUID(), Types.OTHER)
                .addValue("queue", n.queue())
                .addValue("type", n.type())
                .addValue("payload", n.payloadJson())
                .addValue("priority", n.priority())
                .addValue("maxAttempts", n.maxAttempts())
                .addValue("runAt", Sql.odt(n.runAt()), Types.TIMESTAMP_WITH_TIMEZONE)
                .addValue("key", n.idempotencyKey(), Types.VARCHAR)
                .addValue("scheduleId", n.scheduleId(), Types.OTHER);

        List<Job> inserted = jdbc.query("""
                INSERT INTO jobs (id, queue, type, payload, priority, status, attempts, max_attempts,
                                  run_at, idempotency_key, schedule_id, created_at, updated_at)
                VALUES (:id, :queue, :type, CAST(:payload AS jsonb), :priority, 'PENDING', 0, :maxAttempts,
                        :runAt, :key, :scheduleId, now(), now())
                ON CONFLICT (idempotency_key) DO NOTHING
                RETURNING *
                """, p, JOB_MAPPER);

        if (!inserted.isEmpty()) {
            return new InsertResult(inserted.get(0), true);
        }
        Job existing = findByIdempotencyKey(n.idempotencyKey())
                .orElseThrow(() -> new IllegalStateException("Idempotency conflict but no existing job found"));
        return new InsertResult(existing, false);
    }

    /**
     * The heart of the queue. FOR UPDATE SKIP LOCKED lets N workers run this
     * concurrently: rows locked by one worker's transaction are skipped by the
     * others, so a job can never be handed to two workers.
     */
    public List<Job> claim(String workerId, int limit, int leaseSeconds) {
        if (limit <= 0) {
            return List.of();
        }
        MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("worker", workerId)
                .addValue("limit", limit)
                .addValue("lease", leaseSeconds);
        return jdbc.query("""
                WITH next AS (
                    SELECT j.id
                    FROM jobs j
                    WHERE j.status = 'PENDING'
                      AND j.run_at <= now()
                      AND NOT EXISTS (SELECT 1 FROM queues q WHERE q.name = j.queue AND q.paused)
                    ORDER BY j.priority DESC, j.run_at ASC
                    LIMIT :limit
                    FOR UPDATE OF j SKIP LOCKED
                )
                UPDATE jobs j
                SET status       = 'RUNNING',
                    attempts     = j.attempts + 1,
                    locked_by    = :worker,
                    locked_until = now() + (:lease * interval '1 second'),
                    started_at   = now(),
                    updated_at   = now()
                FROM next
                WHERE j.id = next.id
                RETURNING j.*
                """, p, JOB_MAPPER);
    }

    /**
     * Completion is fenced by (locked_by, attempts): if the lease expired and the job
     * was re-claimed, the stale worker's update matches zero rows and is ignored.
     */
    public boolean markSucceeded(UUID id, String workerId, int attempt) {
        return jdbc.update("""
                UPDATE jobs
                SET status = 'SUCCEEDED', finished_at = now(), updated_at = now(),
                    locked_by = NULL, locked_until = NULL, last_error = NULL
                WHERE id = :id AND status = 'RUNNING' AND locked_by = :worker AND attempts = :attempt
                """, fence(id, workerId, attempt)) == 1;
    }

    public boolean markRetry(UUID id, String workerId, int attempt, Instant retryAt, String error) {
        return jdbc.update("""
                UPDATE jobs
                SET status = 'PENDING', run_at = :retryAt, last_error = :error, updated_at = now(),
                    locked_by = NULL, locked_until = NULL
                WHERE id = :id AND status = 'RUNNING' AND locked_by = :worker AND attempts = :attempt
                """, fence(id, workerId, attempt)
                .addValue("retryAt", Sql.odt(retryAt), Types.TIMESTAMP_WITH_TIMEZONE)
                .addValue("error", error, Types.VARCHAR)) == 1;
    }

    public boolean markDead(UUID id, String workerId, int attempt, String error) {
        return jdbc.update("""
                UPDATE jobs
                SET status = 'DEAD', finished_at = now(), last_error = :error, updated_at = now(),
                    locked_by = NULL, locked_until = NULL
                WHERE id = :id AND status = 'RUNNING' AND locked_by = :worker AND attempts = :attempt
                """, fence(id, workerId, attempt).addValue("error", error, Types.VARCHAR)) == 1;
    }

    /** Hand a job back without consuming an attempt (used during graceful shutdown). */
    public int releaseAll(String workerId) {
        return jdbc.update("""
                UPDATE jobs
                SET status = 'PENDING', attempts = GREATEST(attempts - 1, 0), run_at = now(),
                    locked_by = NULL, locked_until = NULL, updated_at = now()
                WHERE status = 'RUNNING' AND locked_by = :worker
                """, new MapSqlParameterSource("worker", workerId));
    }

    /** Heartbeat: keep leases alive for jobs this worker is still executing. */
    public int extendLeases(Collection<UUID> ids, String workerId, int leaseSeconds) {
        if (ids.isEmpty()) {
            return 0;
        }
        return jdbc.update("""
                UPDATE jobs
                SET locked_until = now() + (:lease * interval '1 second')
                WHERE id IN (:ids) AND status = 'RUNNING' AND locked_by = :worker
                """, new MapSqlParameterSource()
                .addValue("ids", new ArrayList<>(ids))
                .addValue("worker", workerId)
                .addValue("lease", leaseSeconds));
    }

    /**
     * Crash recovery: a RUNNING job whose lease expired belongs to a worker that died
     * (or hung). Put it back on the queue, or dead-letter it if attempts are exhausted.
     */
    public List<Job> reapExpiredLeases() {
        return jdbc.query("""
                UPDATE jobs
                SET status       = CASE WHEN attempts >= max_attempts THEN 'DEAD' ELSE 'PENDING' END,
                    finished_at  = CASE WHEN attempts >= max_attempts THEN now() ELSE finished_at END,
                    last_error   = 'Lease expired: worker ' || COALESCE(locked_by, '?') || ' stopped responding',
                    locked_by    = NULL,
                    locked_until = NULL,
                    run_at       = now(),
                    updated_at   = now()
                WHERE status = 'RUNNING' AND locked_until < now()
                RETURNING *
                """, new MapSqlParameterSource(), JOB_MAPPER);
    }

    public boolean cancel(UUID id) {
        return jdbc.update("""
                UPDATE jobs SET status = 'CANCELLED', finished_at = now(), updated_at = now()
                WHERE id = :id AND status = 'PENDING'
                """, idParam(id)) == 1;
    }

    public boolean requeue(UUID id) {
        return jdbc.update("""
                UPDATE jobs
                SET status = 'PENDING', attempts = 0, run_at = now(), last_error = NULL,
                    finished_at = NULL, updated_at = now()
                WHERE id = :id AND status IN ('DEAD', 'CANCELLED')
                """, idParam(id)) == 1;
    }

    public int requeueAllDead(String queue) {
        MapSqlParameterSource p = new MapSqlParameterSource().addValue("queue", queue, Types.VARCHAR);
        String sql = """
                UPDATE jobs
                SET status = 'PENDING', attempts = 0, run_at = now(), last_error = NULL,
                    finished_at = NULL, updated_at = now()
                WHERE status = 'DEAD'
                """ + (queue == null ? "" : " AND queue = :queue");
        return jdbc.update(sql, p);
    }

    public Optional<Job> findById(UUID id) {
        return jdbc.query("SELECT * FROM jobs WHERE id = :id", idParam(id), JOB_MAPPER).stream().findFirst();
    }

    public Optional<Job> findByIdempotencyKey(String key) {
        if (key == null) {
            return Optional.empty();
        }
        return jdbc.query("SELECT * FROM jobs WHERE idempotency_key = :key",
                new MapSqlParameterSource("key", key), JOB_MAPPER).stream().findFirst();
    }

    public record JobFilter(JobStatus status, String queue, String type, String search) {
    }

    public List<Job> search(JobFilter f, int page, int size) {
        MapSqlParameterSource p = filterParams(f).addValue("limit", size).addValue("offset", page * size);
        return jdbc.query("SELECT * FROM jobs" + where(f) + " ORDER BY created_at DESC LIMIT :limit OFFSET :offset",
                p, JOB_MAPPER);
    }

    public long count(JobFilter f) {
        Long n = jdbc.queryForObject("SELECT count(*) FROM jobs" + where(f), filterParams(f), Long.class);
        return n == null ? 0 : n;
    }

    private static String where(JobFilter f) {
        List<String> clauses = new ArrayList<>();
        if (f.status() != null) clauses.add("status = :status");
        if (f.queue() != null && !f.queue().isBlank()) clauses.add("queue = :queue");
        if (f.type() != null && !f.type().isBlank()) clauses.add("type = :type");
        if (f.search() != null && !f.search().isBlank()) {
            clauses.add("(CAST(id AS text) LIKE :search OR idempotency_key LIKE :search OR last_error ILIKE :search)");
        }
        return clauses.isEmpty() ? "" : " WHERE " + String.join(" AND ", clauses);
    }

    private static MapSqlParameterSource filterParams(JobFilter f) {
        return new MapSqlParameterSource()
                .addValue("status", f.status() == null ? null : f.status().name(), Types.VARCHAR)
                .addValue("queue", f.queue(), Types.VARCHAR)
                .addValue("type", f.type(), Types.VARCHAR)
                .addValue("search", f.search() == null ? null : "%" + f.search().trim() + "%", Types.VARCHAR);
    }

    private static MapSqlParameterSource fence(UUID id, String workerId, int attempt) {
        return idParam(id).addValue("worker", workerId).addValue("attempt", attempt);
    }

    private static MapSqlParameterSource idParam(UUID id) {
        return new MapSqlParameterSource().addValue("id", id, Types.OTHER);
    }
}
