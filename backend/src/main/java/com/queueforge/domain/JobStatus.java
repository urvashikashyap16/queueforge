package com.queueforge.domain;

/**
 * Job lifecycle:
 * PENDING -> RUNNING -> SUCCEEDED
 *                    -> PENDING (retry with backoff)
 *                    -> DEAD    (attempts exhausted / non-retryable error)
 * PENDING -> CANCELLED
 * DEAD | CANCELLED -> PENDING (manual retry)
 */
public enum JobStatus {
    PENDING,
    RUNNING,
    SUCCEEDED,
    DEAD,
    CANCELLED
}
