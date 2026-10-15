package com.queueforge.domain;

import com.fasterxml.jackson.annotation.JsonRawValue;

import java.time.Instant;
import java.util.UUID;

public record Job(
        UUID id,
        String queue,
        String type,
        @JsonRawValue String payload,
        int priority,
        JobStatus status,
        int attempts,
        int maxAttempts,
        Instant runAt,
        String lockedBy,
        Instant lockedUntil,
        String lastError,
        String idempotencyKey,
        UUID scheduleId,
        Instant createdAt,
        Instant startedAt,
        Instant finishedAt,
        Instant updatedAt
) {
}
