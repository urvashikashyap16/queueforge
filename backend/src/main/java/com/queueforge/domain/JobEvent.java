package com.queueforge.domain;

import java.time.Instant;
import java.util.UUID;

/**
 * Pushed to dashboards over Server-Sent Events.
 * kind: ENQUEUED | STARTED | SUCCEEDED | RETRY_SCHEDULED | DEAD | CANCELLED | REQUEUED | LEASE_EXPIRED
 */
public record JobEvent(
        String kind,
        UUID jobId,
        String queue,
        String type,
        int attempt,
        String message,
        String workerId,
        Long durationMs,
        Instant at
) {
    public static JobEvent of(String kind, Job job, String message, String workerId, Long durationMs) {
        return new JobEvent(kind, job.id(), job.queue(), job.type(), job.attempts(), message, workerId, durationMs, Instant.now());
    }
}
