package com.queueforge.domain;

import java.time.Instant;
import java.util.UUID;

public record JobAttempt(
        long id,
        UUID jobId,
        int attemptNo,
        String workerId,
        Instant startedAt,
        Instant finishedAt,
        String outcome,
        String error,
        Long durationMs
) {
}
