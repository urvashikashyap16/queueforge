package com.queueforge.api.dto;

import com.queueforge.domain.QueueSummary;
import com.queueforge.domain.WorkerNode;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public record StatsResponse(
        Map<String, Long> statusCounts,
        double successRate15m,
        long completedLastMinute,
        Double p50Ms,
        Double p95Ms,
        Double p99Ms,
        Double oldestPendingSeconds,
        List<ThroughputPoint> throughput,
        List<TypeStat> byType,
        List<QueueSummary> queues,
        List<WorkerNode> workers,
        Instant generatedAt
) {
    public record ThroughputPoint(Instant minute, long succeeded, long failed) {
    }

    public record TypeStat(String type, long total, long succeeded, long dead, Double avgMs) {
    }
}
