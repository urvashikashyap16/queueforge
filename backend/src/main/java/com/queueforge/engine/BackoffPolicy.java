package com.queueforge.engine;

import com.queueforge.config.QueueForgeProperties;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.DoubleSupplier;

/**
 * Exponential backoff with jitter: delay = min(max, base * 2^(attempt-1)) +/- jitter%.
 * Jitter spreads retries out so a downstream outage doesn't cause a "thundering herd"
 * of synchronized retries the moment it recovers.
 */
@Component
public class BackoffPolicy {

    private final long baseMs;
    private final long maxMs;
    private final double jitter;
    private final DoubleSupplier random;

    @Autowired
    public BackoffPolicy(QueueForgeProperties props) {
        this(props.retry().baseDelayMs(), props.retry().maxDelayMs(), props.retry().jitter(),
                () -> ThreadLocalRandom.current().nextDouble());
    }

    public BackoffPolicy(long baseMs, long maxMs, double jitter, DoubleSupplier random) {
        if (baseMs <= 0 || maxMs < baseMs || jitter < 0 || jitter >= 1) {
            throw new IllegalArgumentException("Invalid backoff configuration");
        }
        this.baseMs = baseMs;
        this.maxMs = maxMs;
        this.jitter = jitter;
        this.random = random;
    }

    /** @param attempt the attempt that just failed (1-based) */
    public Duration delayFor(int attempt) {
        int exponent = Math.max(0, Math.min(attempt - 1, 30)); // cap to avoid overflow
        long raw = Math.min(maxMs, baseMs * (1L << exponent));
        double factor = 1 + jitter * (2 * random.getAsDouble() - 1); // in [1 - jitter, 1 + jitter)
        return Duration.ofMillis(Math.max(baseMs / 2, Math.round(raw * factor)));
    }
}
