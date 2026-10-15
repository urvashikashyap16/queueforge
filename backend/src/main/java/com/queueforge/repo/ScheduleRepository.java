package com.queueforge.repo;

import com.queueforge.domain.Schedule;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Types;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public class ScheduleRepository {

    private static final RowMapper<Schedule> MAPPER = (rs, i) -> new Schedule(
            Sql.uuid(rs, "id"),
            rs.getString("name"),
            rs.getString("cron"),
            rs.getString("queue"),
            rs.getString("type"),
            rs.getString("payload"),
            rs.getInt("priority"),
            rs.getInt("max_attempts"),
            rs.getBoolean("enabled"),
            Sql.ts(rs, "next_run_at"),
            Sql.ts(rs, "last_run_at"),
            Sql.ts(rs, "created_at"));

    private final NamedParameterJdbcTemplate jdbc;

    public ScheduleRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Schedule insert(String name, String cron, String queue, String type, String payloadJson,
                           int priority, int maxAttempts, boolean enabled, Instant nextRunAt) {
        return jdbc.queryForObject("""
                INSERT INTO schedules (id, name, cron, queue, type, payload, priority, max_attempts, enabled, next_run_at)
                VALUES (:id, :name, :cron, :queue, :type, CAST(:payload AS jsonb), :priority, :maxAttempts, :enabled, :nextRunAt)
                RETURNING *
                """, new MapSqlParameterSource()
                .addValue("id", UUID.randomUUID(), Types.OTHER)
                .addValue("name", name)
                .addValue("cron", cron)
                .addValue("queue", queue)
                .addValue("type", type)
                .addValue("payload", payloadJson)
                .addValue("priority", priority)
                .addValue("maxAttempts", maxAttempts)
                .addValue("enabled", enabled)
                .addValue("nextRunAt", Sql.odt(nextRunAt), Types.TIMESTAMP_WITH_TIMEZONE), MAPPER);
    }

    public Optional<Schedule> update(UUID id, String cron, String queue, String type, String payloadJson,
                                     int priority, int maxAttempts, boolean enabled, Instant nextRunAt) {
        return jdbc.query("""
                UPDATE schedules
                SET cron = :cron, queue = :queue, type = :type, payload = CAST(:payload AS jsonb),
                    priority = :priority, max_attempts = :maxAttempts, enabled = :enabled, next_run_at = :nextRunAt
                WHERE id = :id
                RETURNING *
                """, new MapSqlParameterSource()
                .addValue("id", id, Types.OTHER)
                .addValue("cron", cron)
                .addValue("queue", queue)
                .addValue("type", type)
                .addValue("payload", payloadJson)
                .addValue("priority", priority)
                .addValue("maxAttempts", maxAttempts)
                .addValue("enabled", enabled)
                .addValue("nextRunAt", Sql.odt(nextRunAt), Types.TIMESTAMP_WITH_TIMEZONE), MAPPER).stream().findFirst();
    }

    /**
     * Must be called inside a transaction. SKIP LOCKED means two app instances never
     * fire the same schedule tick: the second one simply doesn't see the locked row.
     */
    public List<Schedule> lockDue(int limit) {
        return jdbc.query("""
                SELECT * FROM schedules
                WHERE enabled AND next_run_at <= now()
                ORDER BY next_run_at
                LIMIT :limit
                FOR UPDATE SKIP LOCKED
                """, new MapSqlParameterSource("limit", limit), MAPPER);
    }

    public void advance(UUID id, Instant firedAt, Instant nextRunAt) {
        jdbc.update("UPDATE schedules SET last_run_at = :firedAt, next_run_at = :next WHERE id = :id",
                new MapSqlParameterSource()
                        .addValue("id", id, Types.OTHER)
                        .addValue("firedAt", Sql.odt(firedAt), Types.TIMESTAMP_WITH_TIMEZONE)
                        .addValue("next", Sql.odt(nextRunAt), Types.TIMESTAMP_WITH_TIMEZONE));
    }

    public List<Schedule> findAll() {
        return jdbc.query("SELECT * FROM schedules ORDER BY name", MAPPER);
    }

    public Optional<Schedule> findById(UUID id) {
        return jdbc.query("SELECT * FROM schedules WHERE id = :id",
                new MapSqlParameterSource().addValue("id", id, Types.OTHER), MAPPER).stream().findFirst();
    }

    public boolean existsByName(String name) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM schedules WHERE name = :name",
                new MapSqlParameterSource("name", name), Integer.class);
        return n != null && n > 0;
    }

    public long count() {
        Long n = jdbc.getJdbcTemplate().queryForObject("SELECT count(*) FROM schedules", Long.class);
        return n == null ? 0 : n;
    }

    public boolean delete(UUID id) {
        return jdbc.update("DELETE FROM schedules WHERE id = :id",
                new MapSqlParameterSource().addValue("id", id, Types.OTHER)) == 1;
    }
}
