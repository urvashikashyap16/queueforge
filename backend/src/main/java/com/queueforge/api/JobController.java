package com.queueforge.api;

import com.queueforge.api.dto.JobDetail;
import com.queueforge.api.dto.PageResponse;
import com.queueforge.api.dto.SubmitJobRequest;
import com.queueforge.domain.Job;
import com.queueforge.domain.JobStatus;
import com.queueforge.repo.JobRepository.InsertResult;
import com.queueforge.repo.JobRepository.JobFilter;
import com.queueforge.service.JobService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/jobs")
@Tag(name = "Jobs")
public class JobController {

    private final JobService jobs;

    public JobController(JobService jobs) {
        this.jobs = jobs;
    }

    @Operation(summary = "Enqueue a job",
            description = "Returns 201 for a new job. If the Idempotency-Key header (or idempotencyKey field) matches an "
                    + "existing job, returns 200 with the original job instead of creating a duplicate.")
    @PostMapping
    public ResponseEntity<Job> submit(@Valid @RequestBody SubmitJobRequest body,
                                      @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyHeader) {
        SubmitJobRequest req = idempotencyHeader == null || idempotencyHeader.isBlank() ? body
                : new SubmitJobRequest(body.queue(), body.type(), body.payload(), body.priority(), body.maxAttempts(),
                body.delaySeconds(), idempotencyHeader);
        InsertResult result = jobs.submit(req);
        return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK)
                .header("Idempotent-Replay", String.valueOf(!result.created()))
                .body(result.job());
    }

    @Operation(summary = "Search jobs (newest first)")
    @GetMapping
    public PageResponse<Job> search(@RequestParam(required = false) JobStatus status,
                                    @RequestParam(required = false) String queue,
                                    @RequestParam(required = false) String type,
                                    @RequestParam(required = false) String q,
                                    @RequestParam(defaultValue = "0") int page,
                                    @RequestParam(defaultValue = "25") int size) {
        return jobs.search(new JobFilter(status, queue, type, q), page, size);
    }

    @Operation(summary = "Get a job with its full attempt history")
    @GetMapping("/{id}")
    public JobDetail get(@PathVariable UUID id) {
        return jobs.get(id);
    }

    @Operation(summary = "Cancel a pending job")
    @PostMapping("/{id}/cancel")
    public Job cancel(@PathVariable UUID id) {
        return jobs.cancel(id);
    }

    @Operation(summary = "Re-queue a dead or cancelled job (resets attempts)")
    @PostMapping("/{id}/retry")
    public Job retry(@PathVariable UUID id) {
        return jobs.requeue(id);
    }

    @Operation(summary = "Re-queue every job in the dead-letter queue (optionally for one queue)")
    @PostMapping("/dead/retry-all")
    public Map<String, Integer> retryAllDead(@RequestParam(required = false) String queue) {
        return Map.of("requeued", jobs.requeueAllDead(queue));
    }
}
