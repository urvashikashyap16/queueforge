package com.queueforge.domain;

import java.time.Instant;

public record WorkerNode(
        String id,
        String host,
        int concurrency,
        int active,
        long processed,
        long failed,
        Instant startedAt,
        Instant lastSeen,
        boolean alive
) {
}
