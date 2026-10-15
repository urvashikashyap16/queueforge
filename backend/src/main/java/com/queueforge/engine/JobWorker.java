package com.queueforge.engine;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.queueforge.config.QueueForgeProperties;
import com.queueforge.domain.Job;
import com.queueforge.domain.JobEvent;
import com.queueforge.repo.AttemptRepository;
import com.queueforge.repo.JobRepository;
import com.queueforge.repo.WorkerRepository;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.net.InetAddress;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Each application instance runs one JobWorker: a poller thread that claims up to
 * (free capacity) jobs per tick, and a bounded thread pool that executes them.
 *
 * Delivery guarantee: at-least-once. A job is only marked SUCCEEDED after its handler
 * returns; if the worker crashes mid-job, the lease expires and LeaseReaper requeues it.
 */
@Component
public class JobWorker {

    private static final Logger log = LoggerFactory.getLogger(JobWorker.class);
    private static final int MAX_ERROR_LENGTH = 2000;

    private final QueueForgeProperties.Worker config;
    private final JobRepository jobs;
    private final AttemptRepository attempts;
    private final WorkerRepository workers;
    private final HandlerRegistry handlers;
    private final BackoffPolicy backoff;
    private final EventHub events;
    private final ObjectMapper mapper;
    private final MeterRegistry metrics;

    private final String workerId;
    private final String host;
    private final ExecutorService executor;
    private final Semaphore capacity;
    private final Map<UUID, Instant> inFlight = new ConcurrentHashMap<>();
    private final AtomicLong processed = new AtomicLong();
    private final AtomicLong failed = new AtomicLong();
    private volatile boolean draining = false;

    public JobWorker(QueueForgeProperties props, JobRepository jobs, AttemptRepository attempts,
                     WorkerRepository workers, HandlerRegistry handlers, BackoffPolicy backoff,
                     EventHub events, ObjectMapper mapper, MeterRegistry metrics) {
        this.config = props.worker();
        this.jobs = jobs;
        this.attempts = attempts;
        this.workers = workers;
        this.handlers = handlers;
        this.backoff = backoff;
        this.events = events;
        this.mapper = mapper;
        this.metrics = metrics;
        this.host = resolveHost();
        this.workerId = host + "-" + UUID.randomUUID().toString().substring(0, 6);
        this.capacity = new Semaphore(config.concurrency());
        AtomicInteger threadNo = new AtomicInteger();
        this.executor = Executors.newFixedThreadPool(config.concurrency(), r -> {
            Thread t = new Thread(r, "qf-worker-" + threadNo.incrementAndGet());
            t.setDaemon(false);
            return t;
        });
        metrics.gauge("queueforge.worker.in_flight", inFlight, Map::size);
        log.info("QueueForge worker {} started with concurrency {}", workerId, config.concurrency());
    }

    /** Poll loop: claim only as many jobs as we have free threads, so nothing sits claimed-but-idle. */
    @Scheduled(fixedDelayString = "${queueforge.worker.poll-interval-ms:500}")
    public void poll() {
        if (!config.enabled() || draining) {
            return;
        }
        int free = capacity.availablePermits();
        if (free == 0) {
            return;
        }
        List<Job> claimed;
        try {
            claimed = jobs.claim(workerId, free, config.leaseSeconds());
        } catch (Exception e) {
            log.warn("Claim failed: {}", e.getMessage());
            return;
        }
        for (Job job : claimed) {
            capacity.acquireUninterruptibly(); // never blocks: we claimed <= free permits on this single thread
            inFlight.put(job.id(), Instant.now());
            executor.submit(() -> {
                try {
                    execute(job);
                } finally {
                    inFlight.remove(job.id());
                    capacity.release();
                }
            });
        }
    }

    void execute(Job job) {
        long attemptId = attempts.start(job.id(), job.attempts(), workerId);
        events.publish(JobEvent.of("STARTED", job, "Attempt " + job.attempts() + "/" + job.maxAttempts(), workerId, null));
        long t0 = System.nanoTime();
        try {
            JobHandler handler = handlers.find(job.type())
                    .orElseThrow(() -> new NonRetryableJobException("No handler registered for type '" + job.type() + "'"));
            JsonNode payload = mapper.readTree(job.payload() == null ? "{}" : job.payload());
            handler.handle(new JobContext(job.id(), job.queue(), job.type(), job.attempts(), job.maxAttempts(), payload));

            long ms = elapsedMs(t0);
            if (jobs.markSucceeded(job.id(), workerId, job.attempts())) {
                attempts.finish(attemptId, "SUCCEEDED", null, ms);
                processed.incrementAndGet();
                record(job, "succeeded", ms);
                events.publish(JobEvent.of("SUCCEEDED", job, "Completed in " + ms + " ms", workerId, ms));
            } else {
                // Our lease expired and someone else owns the job now: drop our result.
                attempts.finish(attemptId, "STALE", "Lease lost before completion", ms);
                log.warn("Job {} completed after its lease was lost; result discarded", job.id());
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            attempts.finish(attemptId, "INTERRUPTED", "Worker shutting down", elapsedMs(t0));
        } catch (NonRetryableJobException e) {
            fail(job, attemptId, t0, e, false);
        } catch (Exception e) {
            fail(job, attemptId, t0, e, true);
        }
    }

    private void fail(Job job, long attemptId, long t0, Exception e, boolean retryable) {
        long ms = elapsedMs(t0);
        String error = truncate(e.getClass().getSimpleName() + ": " + e.getMessage());
        failed.incrementAndGet();
        boolean exhausted = job.attempts() >= job.maxAttempts();

        if (retryable && !exhausted) {
            Duration delay = backoff.delayFor(job.attempts());
            if (jobs.markRetry(job.id(), workerId, job.attempts(), Instant.now().plus(delay), error)) {
                attempts.finish(attemptId, "FAILED", error, ms);
                record(job, "retried", ms);
                events.publish(JobEvent.of("RETRY_SCHEDULED", job,
                        error + " — retrying in " + humanize(delay), workerId, ms));
            }
        } else {
            String reason = retryable ? "Attempts exhausted. " + error : "Non-retryable. " + error;
            if (jobs.markDead(job.id(), workerId, job.attempts(), truncate(reason))) {
                attempts.finish(attemptId, "FAILED", error, ms);
                record(job, "dead", ms);
                events.publish(JobEvent.of("DEAD", job, reason, workerId, ms));
            }
        }
    }

    /** Heartbeat: extend leases of in-flight jobs and report this node's health. */
    @Scheduled(fixedDelayString = "#{${queueforge.worker.heartbeat-seconds:10} * 1000}")
    public void heartbeat() {
        if (!config.enabled()) {
            return;
        }
        try {
            jobs.extendLeases(inFlight.keySet(), workerId, config.leaseSeconds());
            workers.heartbeat(workerId, host, config.concurrency(), inFlight.size(), processed.get(), failed.get());
        } catch (Exception e) {
            log.warn("Heartbeat failed: {}", e.getMessage());
        }
    }

    /**
     * Graceful shutdown: stop claiming, give running jobs time to finish, then hand
     * back anything still running so another instance can pick it up immediately
     * (instead of waiting for the lease to expire).
     */
    @PreDestroy
    public void shutdown() throws InterruptedException {
        draining = true;
        executor.shutdown();
        if (!executor.awaitTermination(20, TimeUnit.SECONDS)) {
            executor.shutdownNow();
        }
        int released = jobs.releaseAll(workerId);
        workers.markStopped(workerId);
        log.info("Worker {} stopped; released {} unfinished job(s)", workerId, released);
    }

    public String workerId() {
        return workerId;
    }

    public int inFlightCount() {
        return inFlight.size();
    }

    private void record(Job job, String outcome, long ms) {
        metrics.counter("queueforge.jobs.completed", "type", job.type(), "queue", job.queue(), "outcome", outcome).increment();
        Timer.builder("queueforge.job.duration").tag("type", job.type()).publishPercentileHistogram()
                .register(metrics).record(Duration.ofMillis(ms));
    }

    private static long elapsedMs(long t0) {
        return (System.nanoTime() - t0) / 1_000_000;
    }

    private static String truncate(String s) {
        return s == null || s.length() <= MAX_ERROR_LENGTH ? s : s.substring(0, MAX_ERROR_LENGTH) + "…";
    }

    private static String humanize(Duration d) {
        long s = d.toSeconds();
        return s < 60 ? s + "s" : (s / 60) + "m " + (s % 60) + "s";
    }

    private static String resolveHost() {
        String env = System.getenv("HOSTNAME");
        if (env != null && !env.isBlank()) {
            return env;
        }
        try {
            return InetAddress.getLocalHost().getHostName();
        } catch (Exception e) {
            return "worker";
        }
    }
}
