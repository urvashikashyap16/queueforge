package com.queueforge.engine;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.UUID;

public record JobContext(
        UUID jobId,
        String queue,
        String type,
        int attempt,
        int maxAttempts,
        JsonNode payload
) {
    public boolean isLastAttempt() {
        return attempt >= maxAttempts;
    }
}
