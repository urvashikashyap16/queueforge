package com.queueforge.domain;

public record QueueSummary(
        String name,
        boolean paused,
        long pending,
        long running,
        long succeeded,
        long dead,
        Double oldestPendingSeconds
) {
}
