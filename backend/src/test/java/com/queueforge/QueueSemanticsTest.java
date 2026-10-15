package com.queueforge;

import com.queueforge.domain.Job;
import com.queueforge.domain.JobStatus;
import com.queueforge.repo.JobRepository;
import com.queueforge.repo.JobRepository.NewJob;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Integration tests against a real PostgreSQL (Testcontainers; needs Docker).
 * The background worker and scheduler are disabled so the tests drive the queue directly.
 */
@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(properties = {
        "queueforge.worker.enabled=false",
        "queueforge.scheduler.enabled=false",
        "queueforge.demo.seed-schedules=false"
})
class QueueSemanticsTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    JobRepository jobs;

    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void clean() {
        jdbc.update("DELETE FROM job_attempts");
        jdbc.update("DELETE FROM jobs");
        jdbc.update("UPDATE queues SET paused = false");
    }

    @Test
    void concurrentWorkersNeverClaimTheSameJob() throws Exception {
        int total = 500;
        for (int i = 0; i < total; i++) {
            jobs.insert(newJob("default", 0, null));
        }

        int workerCount = 8;
        ExecutorService pool = Executors.newFixedThreadPool(workerCount);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<List<UUID>>> futures = new ArrayList<>();
        for (int w = 0; w < workerCount; w++) {
            String workerId = "worker-" + w;
            futures.add(pool.submit(() -> {
                start.await();
                List<UUID> mine = new ArrayList<>();
                List<Job> batch;
                while (!(batch = jobs.claim(workerId, 7, 60)).isEmpty()) {
                    batch.forEach(j -> mine.add(j.id()));
                }
                return mine;
            }));
        }
        start.countDown(); // release all workers at the same instant

        List<UUID> all = Collections.synchronizedList(new ArrayList<>());
        for (Future<List<UUID>> f : futures) {
            all.addAll(f.get(60, TimeUnit.SECONDS));
        }
        pool.shutdown();

        Set<UUID> unique = new HashSet<>(all);
        assertThat(all).hasSize(total);          // every job was claimed
        assertThat(unique).hasSize(total);       // ...exactly once
    }

    @Test
    void higherPriorityIsClaimedFirst() {
        jobs.insert(newJob("default", 0, null));
        Job urgent = jobs.insert(newJob("default", 9, null)).job();

        List<Job> claimed = jobs.claim("w", 1, 60);
        assertThat(claimed).extracting(Job::id).containsExactly(urgent.id());
    }

    @Test
    void sameIdempotencyKeyCreatesOnlyOneJob() {
        var first = jobs.insert(newJob("default", 0, "order-42"));
        var second = jobs.insert(newJob("default", 0, "order-42"));

        assertThat(first.created()).isTrue();
        assertThat(second.created()).isFalse();
        assertThat(second.job().id()).isEqualTo(first.job().id());
    }

    @Test
    void pausedQueuesAreSkipped() {
        jdbc.update("UPDATE queues SET paused = true WHERE name = 'emails'");
        jobs.insert(newJob("emails", 5, null));
        Job other = jobs.insert(newJob("default", 0, null)).job();

        assertThat(jobs.claim("w", 10, 60)).extracting(Job::id).containsExactly(other.id());
    }

    @Test
    void staleWorkerCannotCompleteAJobItNoLongerOwns() {
        Job job = jobs.insert(newJob("default", 0, null)).job();
        Job claimed = jobs.claim("worker-a", 1, 60).get(0);

        // Simulate lease expiry and re-claim by another worker
        jdbc.update("UPDATE jobs SET locked_until = now() - interval '1 second' WHERE id = ?", job.id());
        jobs.reapExpiredLeases();
        jobs.claim("worker-b", 1, 60);

        assertThat(jobs.markSucceeded(job.id(), "worker-a", claimed.attempts())).isFalse();
        assertThat(jobs.findById(job.id()).orElseThrow().status()).isEqualTo(JobStatus.RUNNING);
    }

    @Test
    void expiredLeaseOnLastAttemptGoesToDeadLetter() {
        Job job = jobs.insert(new NewJob("default", "email.send", "{}", 0, 1, Instant.now(), null, null)).job();
        jobs.claim("w", 1, 60);
        jdbc.update("UPDATE jobs SET locked_until = now() - interval '1 second' WHERE id = ?", job.id());

        jobs.reapExpiredLeases();

        assertThat(jobs.findById(job.id()).orElseThrow().status()).isEqualTo(JobStatus.DEAD);
    }

    private static NewJob newJob(String queue, int priority, String key) {
        return new NewJob(queue, "email.send", "{\"to\":\"a@b.c\"}", priority, 5, Instant.now().minusSeconds(1), key, null);
    }
}
