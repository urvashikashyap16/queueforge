package com.queueforge.engine;

/** A permanent failure (bad input, business rule violation). Retrying would not help, so the job is dead-lettered. */
public class NonRetryableJobException extends RuntimeException {

    public NonRetryableJobException(String message) {
        super(message);
    }
}
