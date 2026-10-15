package com.queueforge.repo;

import com.queueforge.domain.WorkerNode;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;

/** Worker instances register here so the dashboard can show the whole cluster, not just one node. */
@Repository
public class WorkerRepository {

    private final NamedParameterJdbcTemplate jdbc;

    public WorkerRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void heartbeat(String id, String host, int concurrency, int active, long processed, long failed) {
        jdbc.update("""
                INSERT INTO worker_nodes (id, host, concurrency, active, processed, failed, started_at, last_seen)
                VALUES (:id, :host, :concurrency, :active, :processed, :failed, now(), now())
                ON CONFLICT (id) DO UPDATE
                SET active = EXCLUDED.active, processed = EXCLUDED.processed, failed = EXCLUDED.failed,
                    concurrency = EXCLUDED.concurrency, last_seen = now()
                """, new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("host", host)
                .addValue("concurrency", concurrency)
                .addValue("active", active)
                .addValue("processed", processed)
                .addValue("failed", failed));
    }

    public List<WorkerNode> findRecent() {
        return jdbc.query("""
                SELECT *, (last_seen > now() - interval '30 seconds') AS alive
                FROM worker_nodes
                WHERE last_seen > now() - interval '1 hour'
                ORDER BY started_at DESC
                """, new MapSqlParameterSource(), (rs, i) -> new WorkerNode(
                rs.getString("id"),
                rs.getString("host"),
                rs.getInt("concurrency"),
                rs.getInt("active"),
                rs.getLong("processed"),
                rs.getLong("failed"),
                Sql.ts(rs, "started_at"),
                Sql.ts(rs, "last_seen"),
                rs.getBoolean("alive")));
    }

    public void markStopped(String id) {
        jdbc.update("UPDATE worker_nodes SET active = 0, last_seen = now() - interval '31 seconds' WHERE id = :id",
                new MapSqlParameterSource("id", id));
    }
}
