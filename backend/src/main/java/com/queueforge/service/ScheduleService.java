package com.queueforge.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.queueforge.api.dto.ScheduleRequest;
import com.queueforge.config.QueueForgeProperties;
import com.queueforge.domain.Schedule;
import com.queueforge.engine.HandlerRegistry;
import com.queueforge.repo.ScheduleRepository;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class ScheduleService {

    private final ScheduleRepository schedules;
    private final HandlerRegistry handlers;
    private final JobService jobService;
    private final ZoneId zone;

    public ScheduleService(ScheduleRepository schedules, HandlerRegistry handlers, JobService jobService,
                           QueueForgeProperties props) {
        this.schedules = schedules;
        this.handlers = handlers;
        this.jobService = jobService;
        this.zone = ZoneId.of(props.scheduler().zone());
    }

    public List<Schedule> list() {
        return schedules.findAll();
    }

    public Schedule create(ScheduleRequest req) {
        validate(req);
        if (schedules.existsByName(req.name())) {
            throw new ConflictException("A schedule named '" + req.name() + "' already exists");
        }
        String cron = normalize(req.cron());
        return schedules.insert(req.name(), cron, queueOf(req), req.type(), json(req.payload()),
                priorityOf(req), maxAttemptsOf(req), req.enabled() == null || req.enabled(), nextRun(cron, Instant.now()));
    }

    public Schedule update(UUID id, ScheduleRequest req) {
        validate(req);
        String cron = normalize(req.cron());
        return schedules.update(id, cron, queueOf(req), req.type(), json(req.payload()), priorityOf(req),
                        maxAttemptsOf(req), req.enabled() == null || req.enabled(), nextRun(cron, Instant.now()))
                .orElseThrow(() -> new NotFoundException("Schedule " + id + " not found"));
    }

    public Schedule setEnabled(UUID id, boolean enabled) {
        Schedule s = schedules.findById(id).orElseThrow(() -> new NotFoundException("Schedule " + id + " not found"));
        return schedules.update(id, s.cron(), s.queue(), s.type(), s.payload(), s.priority(), s.maxAttempts(),
                enabled, nextRun(s.cron(), Instant.now())).orElseThrow();
    }

    public void delete(UUID id) {
        if (!schedules.delete(id)) {
            throw new NotFoundException("Schedule " + id + " not found");
        }
    }

    /** "Run now": enqueue a one-off job from the schedule without moving its regular cadence. */
    public void trigger(UUID id) {
        Schedule s = schedules.findById(id).orElseThrow(() -> new NotFoundException("Schedule " + id + " not found"));
        jobService.enqueueFromSchedule(s, Instant.now());
    }

    /** Next N fire times, for the dashboard's cron preview. */
    public List<Instant> preview(String cron, int count) {
        String normalized = normalize(cron);
        List<Instant> out = new ArrayList<>();
        Instant cursor = Instant.now();
        for (int i = 0; i < count; i++) {
            cursor = nextRun(normalized, cursor);
            out.add(cursor);
        }
        return out;
    }

    public Instant nextRun(String cron, Instant after) {
        ZonedDateTime next = CronExpression.parse(cron).next(after.atZone(zone));
        if (next == null) {
            throw new IllegalArgumentException("Cron expression never fires: " + cron);
        }
        return next.toInstant();
    }

    /** Accept classic 5-field cron ("* /5 * * * *" style) as well as Spring's 6-field (with seconds) and macros. */
    public static String normalize(String cron) {
        if (cron == null || cron.isBlank()) {
            throw new IllegalArgumentException("Cron expression is required");
        }
        String trimmed = cron.trim().replaceAll("\\s+", " ");
        String result = !trimmed.startsWith("@") && trimmed.split(" ").length == 5 ? "0 " + trimmed : trimmed;
        if (!CronExpression.isValidExpression(result)) {
            throw new IllegalArgumentException("Invalid cron expression: " + cron);
        }
        return result;
    }

    private void validate(ScheduleRequest req) {
        if (!handlers.supports(req.type())) {
            throw new IllegalArgumentException("Unknown job type '" + req.type() + "'");
        }
        normalize(req.cron());
    }

    private static String queueOf(ScheduleRequest req) {
        return req.queue() == null || req.queue().isBlank() ? "default" : req.queue().trim();
    }

    private static int priorityOf(ScheduleRequest req) {
        return req.priority() == null ? 0 : req.priority();
    }

    private static int maxAttemptsOf(ScheduleRequest req) {
        return req.maxAttempts() == null ? JobService.DEFAULT_MAX_ATTEMPTS : req.maxAttempts();
    }

    private static String json(JsonNode node) {
        return node == null || node.isNull() ? "{}" : node.toString();
    }
}
