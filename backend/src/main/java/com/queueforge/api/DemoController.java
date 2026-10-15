package com.queueforge.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.queueforge.api.dto.SubmitJobRequest;
import com.queueforge.service.JobService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

/** Load generator for demos: fires a burst of realistic mixed jobs at the queue. */
@RestController
@RequestMapping("/api/demo")
@Tag(name = "Demo")
public class DemoController {

    private record Template(String type, String queue, int weight) {
    }

    private static final List<Template> TEMPLATES = List.of(
            new Template("email.send", "emails", 35),
            new Template("image.resize", "default", 20),
            new Template("webhook.deliver", "webhooks", 20),
            new Template("report.generate", "reports", 10),
            new Template("payment.reconcile", "payments", 10),
            new Template("demo.flaky", "default", 5));

    private final JobService jobs;
    private final ObjectMapper mapper;

    public DemoController(JobService jobs, ObjectMapper mapper) {
        this.jobs = jobs;
        this.mapper = mapper;
    }

    @Operation(summary = "Enqueue a burst of random demo jobs (max 2000)")
    @PostMapping("/burst")
    public Map<String, Integer> burst(@RequestParam(defaultValue = "100") int count) {
        int n = Math.min(Math.max(count, 1), 2000);
        ThreadLocalRandom rnd = ThreadLocalRandom.current();
        int totalWeight = TEMPLATES.stream().mapToInt(Template::weight).sum();
        for (int i = 0; i < n; i++) {
            Template t = pick(rnd.nextInt(totalWeight));
            ObjectNode payload = mapper.createObjectNode();
            switch (t.type()) {
                case "email.send" -> payload.put("to", "user" + rnd.nextInt(10_000) + "@example.com")
                        .put("template", rnd.nextBoolean() ? "welcome" : "order-confirmation");
                case "image.resize" -> payload.put("imageId", "img_" + rnd.nextInt(100_000))
                        .put("width", 1280).put("height", 720);
                case "webhook.deliver" -> payload.put("url", "https://partner-" + rnd.nextInt(20) + ".example.com/hooks")
                        .put("event", "order.created");
                case "report.generate" -> payload.put("reportType", rnd.nextBoolean() ? "sales" : "inventory")
                        .put("rows", 10_000 + rnd.nextInt(90_000));
                case "payment.reconcile" -> payload.put("transactionId", "txn_" + rnd.nextInt(1_000_000))
                        .put("amount", rnd.nextInt(100) < 8 ? -1 : 100 + rnd.nextInt(9_900));
                default -> payload.put("note", "fails twice, then succeeds");
            }
            int priority = rnd.nextInt(100) < 15 ? 5 : 0;
            long delay = rnd.nextInt(100) < 10 ? rnd.nextInt(5, 60) : 0;
            jobs.submit(new SubmitJobRequest(t.queue(), t.type(), payload, priority, null, delay, null));
        }
        return Map.of("enqueued", n);
    }

    private static Template pick(int roll) {
        int acc = 0;
        for (Template t : TEMPLATES) {
            acc += t.weight();
            if (roll < acc) {
                return t;
            }
        }
        return TEMPLATES.get(0);
    }
}
