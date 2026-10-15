package com.queueforge.api;

import com.queueforge.api.dto.ScheduleRequest;
import com.queueforge.domain.Schedule;
import com.queueforge.service.ScheduleService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/schedules")
@Tag(name = "Schedules")
public class ScheduleController {

    private final ScheduleService schedules;

    public ScheduleController(ScheduleService schedules) {
        this.schedules = schedules;
    }

    @GetMapping
    public List<Schedule> list() {
        return schedules.list();
    }

    @PostMapping
    public ResponseEntity<Schedule> create(@Valid @RequestBody ScheduleRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(schedules.create(req));
    }

    @PutMapping("/{id}")
    public Schedule update(@PathVariable UUID id, @Valid @RequestBody ScheduleRequest req) {
        return schedules.update(id, req);
    }

    @PostMapping("/{id}/enable")
    public Schedule enable(@PathVariable UUID id) {
        return schedules.setEnabled(id, true);
    }

    @PostMapping("/{id}/disable")
    public Schedule disable(@PathVariable UUID id) {
        return schedules.setEnabled(id, false);
    }

    @PostMapping("/{id}/trigger")
    public ResponseEntity<Void> trigger(@PathVariable UUID id) {
        schedules.trigger(id);
        return ResponseEntity.accepted().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        schedules.delete(id);
        return ResponseEntity.noContent().build();
    }

    /** Preview the next fire times of a cron expression before saving it. */
    @GetMapping("/preview")
    public List<Instant> preview(@RequestParam String cron, @RequestParam(defaultValue = "5") int count) {
        return schedules.preview(cron, Math.min(Math.max(count, 1), 20));
    }
}
