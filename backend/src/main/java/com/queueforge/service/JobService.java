package com.queueforge.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.queueforge.api.dto.JobDetail;
import com.queueforge.api.dto.PageResponse;
import com.queueforge.api.dto.SubmitJobRequest;
import com.queueforge.domain.Job;
import com.queueforge.domain.JobEvent;
import com.queueforge.domain.Schedule;
import com.queueforge.engine.EventHub;
import com.queueforge.engine.HandlerRegistry;
import com.queueforge.repo.AttemptRepository;
import com.queueforge.repo.JobRepository;
import com.queueforge.repo.JobRepository.InsertResult;
import com.queueforge.repo.JobRepository.JobFilter;
import com.queueforge.repo.QueueRepository;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.UUID;

@Service
public class JobService {

    public static final int DEFAULT_MAX_ATTEMPTS = 5;

    private final JobRepository jobs;
    private final AttemptRepository attempts;
    private final QueueRepository queues;
    private final HandlerRegistry handlers;
    private final EventHub events;
    private final MeterRegistry metrics;

    public JobService(JobRepository jobs, AttemptRepository attempts, QueueRepository queues,
                      HandlerRegistry handlers, EventHub events, MeterRegistry metrics) {
        this.jobs = jobs;
        this.attempts = attempts;
        this.queues = queues;
        this.handlers = handlers;
        this.events = events;
        this.metrics = metrics;
    }

    public InsertResult submit(SubmitJobRequest req) {
        if (!handlers.supports(req.type())) {
            throw new IllegalArgumentException("Unknown job type '" + req.type() + "'. Known types: "
                    + handlers.all().stream().map(h -> h.type()).toList());
        }
        String queue = req.queue() == null || req.queue().isBlank() ? "default" : req.queue().trim();
        long delay = req.delaySeconds() == null ? 0 : req.delaySeconds();
        return enqueue(new JobRepository.NewJob(
                queue,
                req.type(),
                toJson(req.payload()),
                req.priority() == null ? 0 : req.priority(),
                req.maxAttempts() == null ? DEFAULT_MAX_ATTEMPTS : req.maxAttempts(),
                Instant.now().plusSeconds(delay),
                blankToNull(req.idempotencyKey()),
                null));
    }

    public InsertResult enqueueFromSchedule(Schedule s, Instant fireTime) {
        return enqueue(new JobRepository.NewJob(
                s.queue(), s.type(), s.payload(), s.priority(), s.maxAttempts(), Instant.now(),
                "schedule:" + s.id() + ":" + fireTime.toEpochMilli(), s.id()));
    }

    private InsertResult enqueue(JobRepository.NewJob newJob) {
        queues.ensureExists(newJob.queue());
        InsertResult result = jobs.insert(newJob);
        if (result.created()) {
            metrics.counter("queueforge.jobs.enqueued", "type", newJob.type(), "queue", newJob.queue()).increment();
            String msg = newJob.runAt().isAfter(Instant.now().plusSeconds(1)) ? "Scheduled for " + newJob.runAt() : "Enqueued";
            events.publish(JobEvent.of("ENQUEUED", result.job(), msg, null, null));
        }
        return result;
    }

    public JobDetail get(UUID id) {
        Job job = jobs.findById(id).orElseThrow(() -> new NotFoundException("Job " + id + " not found"));
        return new JobDetail(job, attempts.forJob(id));
    }

    public PageResponse<Job> search(JobFilter filter, int page, int size) {
        int safeSize = Math.min(Math.max(size, 1), 200);
        int safePage = Math.max(page, 0);
        return new PageResponse<>(jobs.search(filter, safePage, safeSize), safePage, safeSize, jobs.count(filter));
    }

    public Job cancel(UUID id) {
        Job before = jobs.findById(id).orElseThrow(() -> new NotFoundException("Job " + id + " not found"));
        if (!jobs.cancel(id)) {
            throw new ConflictException("Only PENDING jobs can be cancelled (job is " + before.status() + ")");
        }
        Job after = jobs.findById(id).orElseThrow();
        events.publish(JobEvent.of("CANCELLED", after, "Cancelled by user", null, null));
        return after;
    }

    public Job requeue(UUID id) {
        Job before = jobs.findById(id).orElseThrow(() -> new NotFoundException("Job " + id + " not found"));
        if (!jobs.requeue(id)) {
            throw new ConflictException("Only DEAD or CANCELLED jobs can be retried (job is " + before.status() + ")");
        }
        Job after = jobs.findById(id).orElseThrow();
        events.publish(JobEvent.of("REQUEUED", after, "Manually re-queued", null, null));
        return after;
    }

    public int requeueAllDead(String queue) {
        return jobs.requeueAllDead(blankToNull(queue));
    }

    private static String toJson(JsonNode node) {
        return node == null || node.isNull() ? "{}" : node.toString();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
