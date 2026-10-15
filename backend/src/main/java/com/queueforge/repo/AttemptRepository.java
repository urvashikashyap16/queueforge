package com.queueforge.repo;

import com.queueforge.domain.JobAttempt;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Types;
import java.util.List;
import java.util.UUID;

/** Every execution attempt is recorded: this is the job's audit trail and the source of latency metrics. */
@Repository
public class AttemptRepository {

    private static final RowMapper<JobAttempt> MAPPER = (rs, i) -> new JobAttempt(
            rs.getLong("id"),
            Sql.uuid(rs, "job_id"),
            rs.getInt("attempt_no"),
            rs.getString("worker_id"),
            Sql.ts(rs, "started_at"),
            Sql.ts(rs, "finished_at"),
            rs.getString("outcome"),
            rs.getString("error"),
            Sql.nullableLong(rs, "duration_ms"));

    private final NamedParameterJdbcTemplate jdbc;

    public AttemptRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public long start(UUID jobId, int attemptNo, String workerId) {
        Long id = jdbc.queryForObject("""
                INSERT INTO job_attempts (job_id, attempt_no, worker_id, started_at)
                VALUES (:jobId, :attemptNo, :worker, now())
                RETURNING id
                """, new MapSqlParameterSource()
                .addValue("jobId", jobId, Types.OTHER)
                .addValue("attemptNo", attemptNo)
                .addValue("worker", workerId), Long.class);
        return id == null ? -1 : id;
    }

    public void finish(long attemptId, String outcome, String error, long durationMs) {
        jdbc.update("""
                UPDATE job_attempts
                SET finished_at = now(), outcome = :outcome, error = :error, duration_ms = :duration
                WHERE id = :id
                """, new MapSqlParameterSource()
                .addValue("id", attemptId)
                .addValue("outcome", outcome)
                .addValue("error", error, Types.VARCHAR)
                .addValue("duration", durationMs));
    }

    /** Close out attempts orphaned by a crashed worker. */
    public void closeOpenAttempts(UUID jobId, String outcome, String error) {
        jdbc.update("""
                UPDATE job_attempts
                SET finished_at = now(), outcome = :outcome, error = :error,
                    duration_ms = (EXTRACT(EPOCH FROM (now() - started_at)) * 1000)::bigint
                WHERE job_id = :jobId AND finished_at IS NULL
                """, new MapSqlParameterSource()
                .addValue("jobId", jobId, Types.OTHER)
                .addValue("outcome", outcome)
                .addValue("error", error, Types.VARCHAR));
    }

    public List<JobAttempt> forJob(UUID jobId) {
        return jdbc.query("SELECT * FROM job_attempts WHERE job_id = :jobId ORDER BY attempt_no, id",
                new MapSqlParameterSource().addValue("jobId", jobId, Types.OTHER), MAPPER);
    }
}
