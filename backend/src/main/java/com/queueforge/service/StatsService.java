package com.queueforge.service;

import com.queueforge.api.dto.StatsResponse;
import com.queueforge.api.dto.StatsResponse.ThroughputPoint;
import com.queueforge.api.dto.StatsResponse.TypeStat;
import com.queueforge.domain.JobStatus;
import com.queueforge.repo.QueueRepository;
import com.queueforge.repo.WorkerRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Dashboard metrics, computed with SQL aggregates (FILTER, percentile_cont, date_trunc). */
@Service
public class StatsService {

    private static final int THROUGHPUT_MINUTES = 30;

    private final JdbcTemplate jdbc;
    private final QueueRepository queues;
    private final WorkerRepository workers;

    public StatsService(JdbcTemplate jdbc, QueueRepository queues, WorkerRepository workers) {
        this.jdbc = jdbc;
        this.queues = queues;
        this.workers = workers;
    }

    public StatsResponse snapshot() {
        Map<String, Long> statusCounts = new LinkedHashMap<>();
        for (JobStatus s : JobStatus.values()) {
            statusCounts.put(s.name(), 0L);
        }
        jdbc.query("SELECT status, count(*) AS n FROM jobs GROUP BY status",
                rs -> {
                    statusCounts.put(rs.getString("status"), rs.getLong("n"));
                });

        double[] success = new double[]{1.0};
        jdbc.query("""
                SELECT count(*) FILTER (WHERE outcome = 'SUCCEEDED') AS ok,
                       count(*) FILTER (WHERE outcome IN ('FAILED', 'LEASE_EXPIRED')) AS bad
                FROM job_attempts
                WHERE finished_at > now() - interval '15 minutes'
                """, rs -> {
            long ok = rs.getLong("ok");
            long bad = rs.getLong("bad");
            success[0] = ok + bad == 0 ? 1.0 : (double) ok / (ok + bad);
        });

        Long lastMinute = jdbc.queryForObject("""
                SELECT count(*) FROM job_attempts
                WHERE outcome = 'SUCCEEDED' AND finished_at > now() - interval '60 seconds'
                """, Long.class);

        Double[] pct = new Double[3];
        jdbc.query("""
                SELECT percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms) AS p50,
                       percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95,
                       percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms) AS p99
                FROM job_attempts
                WHERE outcome = 'SUCCEEDED' AND finished_at > now() - interval '15 minutes'
                """, rs -> {
            pct[0] = nullableDouble(rs, "p50");
            pct[1] = nullableDouble(rs, "p95");
            pct[2] = nullableDouble(rs, "p99");
        });

        Double oldest = jdbc.queryForObject("""
                SELECT EXTRACT(EPOCH FROM (now() - min(run_at)))
                FROM jobs WHERE status = 'PENDING' AND run_at <= now()
                """, Double.class);

        return new StatsResponse(
                statusCounts,
                success[0],
                lastMinute == null ? 0 : lastMinute,
                pct[0], pct[1], pct[2],
                oldest,
                throughput(),
                byType(),
                queues.summaries(),
                workers.findRecent(),
                Instant.now());
    }

    /** Per-minute completions for the last 30 minutes, with empty minutes filled in as zero. */
    private List<ThroughputPoint> throughput() {
        Map<Instant, long[]> byMinute = new HashMap<>();
        jdbc.query("""
                SELECT date_trunc('minute', finished_at) AS minute,
                       count(*) FILTER (WHERE outcome = 'SUCCEEDED') AS ok,
                       count(*) FILTER (WHERE outcome IN ('FAILED', 'LEASE_EXPIRED')) AS bad
                FROM job_attempts
                WHERE finished_at > now() - interval '30 minutes'
                GROUP BY 1
                """, rs -> {
            Instant minute = rs.getObject("minute", OffsetDateTime.class).toInstant();
            byMinute.put(minute, new long[]{rs.getLong("ok"), rs.getLong("bad")});
        });

        List<ThroughputPoint> points = new ArrayList<>();
        Instant end = Instant.now().truncatedTo(ChronoUnit.MINUTES);
        for (int i = THROUGHPUT_MINUTES - 1; i >= 0; i--) {
            Instant minute = end.minus(i, ChronoUnit.MINUTES);
            long[] v = byMinute.getOrDefault(minute, new long[]{0, 0});
            points.add(new ThroughputPoint(minute, v[0], v[1]));
        }
        return points;
    }

    private List<TypeStat> byType() {
        return jdbc.query("""
                SELECT j.type,
                       count(*)                                     AS total,
                       count(*) FILTER (WHERE j.status = 'SUCCEEDED') AS succeeded,
                       count(*) FILTER (WHERE j.status = 'DEAD')      AS dead,
                       (SELECT avg(a.duration_ms) FROM job_attempts a
                        JOIN jobs j2 ON j2.id = a.job_id
                        WHERE j2.type = j.type AND a.outcome = 'SUCCEEDED'
                          AND a.finished_at > now() - interval '24 hours') AS avg_ms
                FROM jobs j
                WHERE j.created_at > now() - interval '24 hours'
                GROUP BY j.type
                ORDER BY total DESC
                """, (rs, i) -> new TypeStat(
                rs.getString("type"),
                rs.getLong("total"),
                rs.getLong("succeeded"),
                rs.getLong("dead"),
                nullableDouble(rs, "avg_ms")));
    }

    private static Double nullableDouble(ResultSet rs, String column) throws SQLException {
        double v = rs.getDouble(column);
        return rs.wasNull() ? null : v;
    }
}
