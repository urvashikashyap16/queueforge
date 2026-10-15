package com.queueforge.engine;

/**
 * Implement this interface (and annotate with @Component) to teach QueueForge a new job type.
 * Throw any exception to trigger a retry; throw {@link NonRetryableJobException} to dead-letter immediately.
 * Handlers must be idempotent: with at-least-once delivery a job may run more than once.
 */
public interface JobHandler {

    /** Unique job type name, e.g. "email.send". */
    String type();

    /** Short human-readable description shown in the dashboard. */
    default String description() {
        return "";
    }

    /** Example payload shown in the dashboard's submit form. */
    default String examplePayload() {
        return "{}";
    }

    void handle(JobContext context) throws Exception;
}
