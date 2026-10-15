package com.queueforge.engine;

import com.queueforge.domain.Job;
import com.queueforge.domain.JobEvent;
import com.queueforge.domain.JobStatus;
import com.queueforge.repo.AttemptRepository;
import com.queueforge.repo.JobRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Recovers jobs from crashed or frozen workers. Any instance may run this; the
 * single UPDATE ... WHERE locked_until < now() is atomic, so running it on many
 * nodes at once is harmless.
 */
@Component
public class LeaseReaper {

    private static final Logger log = LoggerFactory.getLogger(LeaseReaper.class);

    private final JobRepository jobs;
    private final AttemptRepository attempts;
    private final EventHub events;

    public LeaseReaper(JobRepository jobs, AttemptRepository attempts, EventHub events) {
        this.jobs = jobs;
        this.attempts = attempts;
        this.events = events;
    }

    @Scheduled(fixedDelay = 5_000, initialDelay = 5_000)
    public void reap() {
        try {
            List<Job> reaped = jobs.reapExpiredLeases();
            for (Job job : reaped) {
                attempts.closeOpenAttempts(job.id(), "LEASE_EXPIRED", job.lastError());
                String kind = job.status() == JobStatus.DEAD ? "DEAD" : "LEASE_EXPIRED";
                events.publish(JobEvent.of(kind, job, job.lastError(), null, null));
            }
            if (!reaped.isEmpty()) {
                log.warn("Recovered {} job(s) with expired leases", reaped.size());
            }
        } catch (Exception e) {
            log.warn("Lease reaper failed: {}", e.getMessage());
        }
    }
}
