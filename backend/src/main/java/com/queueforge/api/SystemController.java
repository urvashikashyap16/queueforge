package com.queueforge.api;

import com.queueforge.api.dto.JobTypeInfo;
import com.queueforge.api.dto.StatsResponse;
import com.queueforge.domain.QueueSummary;
import com.queueforge.domain.WorkerNode;
import com.queueforge.engine.EventHub;
import com.queueforge.engine.HandlerRegistry;
import com.queueforge.repo.QueueRepository;
import com.queueforge.repo.WorkerRepository;
import com.queueforge.service.NotFoundException;
import com.queueforge.service.StatsService;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;

/** Queues, workers, stats, job types and the live event stream. */
@RestController
@RequestMapping("/api")
@Tag(name = "System")
public class SystemController {

    private final StatsService stats;
    private final QueueRepository queues;
    private final WorkerRepository workers;
    private final HandlerRegistry handlers;
    private final EventHub events;

    public SystemController(StatsService stats, QueueRepository queues, WorkerRepository workers,
                            HandlerRegistry handlers, EventHub events) {
        this.stats = stats;
        this.queues = queues;
        this.workers = workers;
        this.handlers = handlers;
        this.events = events;
    }

    @GetMapping("/stats")
    public StatsResponse stats() {
        return stats.snapshot();
    }

    @GetMapping("/queues")
    public List<QueueSummary> queues() {
        return queues.summaries();
    }

    @PostMapping("/queues/{name}/pause")
    public List<QueueSummary> pause(@PathVariable String name) {
        if (!queues.setPaused(name, true)) {
            throw new NotFoundException("Queue " + name + " not found");
        }
        return queues.summaries();
    }

    @PostMapping("/queues/{name}/resume")
    public List<QueueSummary> resume(@PathVariable String name) {
        if (!queues.setPaused(name, false)) {
            throw new NotFoundException("Queue " + name + " not found");
        }
        return queues.summaries();
    }

    @GetMapping("/workers")
    public List<WorkerNode> workers() {
        return workers.findRecent();
    }

    @GetMapping("/job-types")
    public List<JobTypeInfo> jobTypes() {
        return handlers.all().stream()
                .map(h -> new JobTypeInfo(h.type(), h.description(), h.examplePayload()))
                .toList();
    }

    @GetMapping(path = "/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter events() {
        return events.subscribe();
    }
}
