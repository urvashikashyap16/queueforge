package com.queueforge.service;

/** The requested state transition is not allowed from the job's current state. */
public class ConflictException extends RuntimeException {

    public ConflictException(String message) {
        super(message);
    }
}
