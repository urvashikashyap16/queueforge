package com.queueforge.repo;

import com.queueforge.domain.QueueSummary;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public class QueueRepository {

    private final NamedParameterJdbcTemplate jdbc;

    public QueueRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void ensureExists(String name) {
        jdbc.update("INSERT INTO queues (name) VALUES (:name) ON CONFLICT (name) DO NOTHING",
                new MapSqlParameterSource("name", name));
    }

    public boolean setPaused(String name, boolean paused) {
        return jdbc.update("UPDATE queues SET paused = :paused WHERE name = :name",
                new MapSqlParameterSource().addValue("name", name).addValue("paused", paused)) == 1;
    }

    public List<QueueSummary> summaries() {
        return jdbc.query("""
                SELECT q.name,
                       q.paused,
                       count(j.id) FILTER (WHERE j.status = 'PENDING')   AS pending,
                       count(j.id) FILTER (WHERE j.status = 'RUNNING')   AS running,
                       count(j.id) FILTER (WHERE j.status = 'SUCCEEDED') AS succeeded,
                       count(j.id) FILTER (WHERE j.status = 'DEAD')      AS dead,
                       EXTRACT(EPOCH FROM (now() - min(j.run_at) FILTER (
                           WHERE j.status = 'PENDING' AND j.run_at <= now())))  AS oldest_pending_seconds
                FROM queues q
                LEFT JOIN jobs j ON j.queue = q.name
                GROUP BY q.name, q.paused
                ORDER BY q.name
                """, new MapSqlParameterSource(), (rs, i) -> new QueueSummary(
                rs.getString("name"),
                rs.getBoolean("paused"),
                rs.getLong("pending"),
                rs.getLong("running"),
                rs.getLong("succeeded"),
                rs.getLong("dead"),
                Sql.nullableDouble(rs, "oldest_pending_seconds")));
    }
}
