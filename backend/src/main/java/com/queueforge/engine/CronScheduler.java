package com.queueforge.engine;

import com.queueforge.config.QueueForgeProperties;
import com.queueforge.domain.Schedule;
import com.queueforge.repo.ScheduleRepository;
import com.queueforge.service.JobService;
import com.queueforge.service.ScheduleService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.List;

/**
 * Turns cron schedules into jobs. Safe to run on every instance:
 *  - due schedules are locked with FOR UPDATE SKIP LOCKED, so one instance fires each tick;
 *  - the job's idempotency key is "schedule:{id}:{fireTime}", so even a retry of this
 *    transaction can never enqueue the same tick twice.
 */
@Component
public class CronScheduler {

    private static final Logger log = LoggerFactory.getLogger(CronScheduler.class);

    private final QueueForgeProperties.Scheduler config;
    private final ScheduleRepository schedules;
    private final ScheduleService scheduleService;
    private final JobService jobService;
    private final TransactionTemplate tx;

    public CronScheduler(QueueForgeProperties props, ScheduleRepository schedules, ScheduleService scheduleService,
                         JobService jobService, TransactionTemplate tx) {
        this.config = props.scheduler();
        this.schedules = schedules;
        this.scheduleService = scheduleService;
        this.jobService = jobService;
        this.tx = tx;
    }

    @Scheduled(fixedDelay = 1_000, initialDelay = 3_000)
    public void tick() {
        if (!config.enabled()) {
            return;
        }
        try {
            Integer fired = tx.execute(status -> {
                List<Schedule> due = schedules.lockDue(50);
                for (Schedule s : due) {
                    Instant fireTime = s.nextRunAt();
                    jobService.enqueueFromSchedule(s, fireTime);
                    schedules.advance(s.id(), fireTime, scheduleService.nextRun(s.cron(), Instant.now()));
                }
                return due.size();
            });
            if (fired != null && fired > 0) {
                log.debug("Fired {} schedule(s)", fired);
            }
        } catch (Exception e) {
            log.warn("Scheduler tick failed: {}", e.getMessage());
        }
    }
}
