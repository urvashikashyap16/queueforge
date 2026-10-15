package com.queueforge.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

/**
 * All tunables live under the "queueforge" prefix in application.yml.
 */
@ConfigurationProperties(prefix = "queueforge")
public record QueueForgeProperties(Worker worker, Retry retry, Scheduler scheduler, Demo demo, Cors cors) {

    public record Worker(boolean enabled, int concurrency, long pollIntervalMs, int leaseSeconds, int heartbeatSeconds) {
    }

    public record Retry(long baseDelayMs, long maxDelayMs, double jitter) {
    }

    public record Scheduler(boolean enabled, String zone) {
    }

    public record Demo(boolean seedSchedules) {
    }

    public record Cors(List<String> allowedOrigins) {
    }
}
