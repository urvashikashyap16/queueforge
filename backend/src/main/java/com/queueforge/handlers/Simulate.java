package com.queueforge.handlers;

import java.util.concurrent.ThreadLocalRandom;

/** Helpers that make the demo handlers behave like real I/O-bound work. */
final class Simulate {

    private Simulate() {
    }

    static void work(int minMs, int maxMs) throws InterruptedException {
        Thread.sleep(ThreadLocalRandom.current().nextInt(minMs, maxMs + 1));
    }

    static void maybeFail(double probability, String message) {
        if (ThreadLocalRandom.current().nextDouble() < probability) {
            throw new TransientFailure(message);
        }
    }

    static final class TransientFailure extends RuntimeException {
        TransientFailure(String message) {
            super(message);
        }
    }
}
