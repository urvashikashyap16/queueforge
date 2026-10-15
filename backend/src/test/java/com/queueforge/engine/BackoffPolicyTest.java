package com.queueforge.engine;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BackoffPolicyTest {

    // random() == 0.5 => jitter factor exactly 1.0, so delays are deterministic
    private final BackoffPolicy noJitter = new BackoffPolicy(1_000, 60_000, 0.2, () -> 0.5);

    @Test
    void delayDoublesEachAttempt() {
        assertThat(noJitter.delayFor(1).toMillis()).isEqualTo(1_000);
        assertThat(noJitter.delayFor(2).toMillis()).isEqualTo(2_000);
        assertThat(noJitter.delayFor(3).toMillis()).isEqualTo(4_000);
        assertThat(noJitter.delayFor(4).toMillis()).isEqualTo(8_000);
    }

    @Test
    void delayIsCappedAtMax() {
        assertThat(noJitter.delayFor(10).toMillis()).isEqualTo(60_000);
        assertThat(noJitter.delayFor(1_000).toMillis()).isEqualTo(60_000); // no overflow
    }

    @Test
    void jitterStaysWithinBounds() {
        BackoffPolicy low = new BackoffPolicy(1_000, 60_000, 0.2, () -> 0.0);
        BackoffPolicy high = new BackoffPolicy(1_000, 60_000, 0.2, () -> 0.999_999);
        assertThat(low.delayFor(3).toMillis()).isEqualTo(3_200);   // 4000 * 0.8
        assertThat(high.delayFor(3).toMillis()).isBetween(4_799L, 4_800L); // ~4000 * 1.2
    }

    @Test
    void rejectsInvalidConfiguration() {
        assertThatThrownBy(() -> new BackoffPolicy(0, 1_000, 0.1, () -> 0.5))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new BackoffPolicy(1_000, 500, 0.1, () -> 0.5))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
