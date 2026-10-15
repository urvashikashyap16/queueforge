package com.queueforge.domain;

import com.fasterxml.jackson.annotation.JsonRawValue;

import java.time.Instant;
import java.util.UUID;

public record Schedule(
        UUID id,
        String name,
        String cron,
        String queue,
        String type,
        @JsonRawValue String payload,
        int priority,
        int maxAttempts,
        boolean enabled,
        Instant nextRunAt,
        Instant lastRunAt,
        Instant createdAt
) {
}
