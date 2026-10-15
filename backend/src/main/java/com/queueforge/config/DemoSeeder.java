package com.queueforge.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.queueforge.api.dto.ScheduleRequest;
import com.queueforge.repo.ScheduleRepository;
import com.queueforge.service.ScheduleService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/** Seeds a few cron schedules on first start so the dashboard is never empty. */
@Component
public class DemoSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DemoSeeder.class);

    private final QueueForgeProperties props;
    private final ScheduleRepository schedules;
    private final ScheduleService scheduleService;
    private final ObjectMapper mapper;

    public DemoSeeder(QueueForgeProperties props, ScheduleRepository schedules, ScheduleService scheduleService,
                      ObjectMapper mapper) {
        this.props = props;
        this.schedules = schedules;
        this.scheduleService = scheduleService;
        this.mapper = mapper;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        if (props.demo() == null || !props.demo().seedSchedules() || schedules.count() > 0) {
            return;
        }
        scheduleService.create(new ScheduleRequest("digest-emails", "0 * * * * *", "emails", "email.send",
                mapper.readTree("{\"to\":\"subscribers@example.com\",\"template\":\"digest\"}"), 0, 3, true));
        scheduleService.create(new ScheduleRequest("partner-sync", "30 * * * * *", "webhooks", "webhook.deliver",
                mapper.readTree("{\"url\":\"https://partner.example.com/sync\",\"event\":\"inventory.sync\"}"), 0, 5, true));
        scheduleService.create(new ScheduleRequest("nightly-sales-report", "0 0 2 * * *", "reports", "report.generate",
                mapper.readTree("{\"reportType\":\"sales\",\"rows\":250000}"), 5, 3, true));
        log.info("Seeded demo schedules");
    }
}
