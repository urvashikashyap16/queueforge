package com.queueforge.handlers;

import com.queueforge.engine.JobContext;
import com.queueforge.engine.JobHandler;
import com.queueforge.engine.NonRetryableJobException;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Example handlers that simulate common background work. In a real system each of
 * these would call an email provider, image library, partner API, etc.
 */
@Configuration
public class DemoHandlers {

    @Bean
    JobHandler emailHandler() {
        return new JobHandler() {
            public String type() { return "email.send"; }
            public String description() { return "Send a transactional email (fails ~5% with SMTP timeouts)"; }
            public String examplePayload() { return "{\"to\":\"user@example.com\",\"template\":\"welcome\"}"; }

            public void handle(JobContext ctx) throws Exception {
                if (!ctx.payload().hasNonNull("to")) {
                    throw new NonRetryableJobException("Missing 'to' address");
                }
                Simulate.work(150, 700);
                Simulate.maybeFail(0.05, "SMTP timeout talking to mail provider");
            }
        };
    }

    @Bean
    JobHandler imageResizeHandler() {
        return new JobHandler() {
            public String type() { return "image.resize"; }
            public String description() { return "Resize an uploaded image into thumbnails"; }
            public String examplePayload() { return "{\"imageId\":\"img_123\",\"width\":1280,\"height\":720}"; }

            public void handle(JobContext ctx) throws Exception {
                Simulate.work(300, 1400);
                Simulate.maybeFail(0.04, "Out of memory decoding image");
            }
        };
    }

    @Bean
    JobHandler webhookHandler() {
        return new JobHandler() {
            public String type() { return "webhook.deliver"; }
            public String description() { return "POST an event to a partner endpoint (flaky: ~12% HTTP 503)"; }
            public String examplePayload() { return "{\"url\":\"https://partner.example.com/hooks\",\"event\":\"order.created\"}"; }

            public void handle(JobContext ctx) throws Exception {
                Simulate.work(80, 600);
                Simulate.maybeFail(0.12, "Partner endpoint returned HTTP 503");
            }
        };
    }

    @Bean
    JobHandler reportHandler() {
        return new JobHandler() {
            public String type() { return "report.generate"; }
            public String description() { return "Build a CSV report (slow, CPU-heavy)"; }
            public String examplePayload() { return "{\"reportType\":\"sales\",\"rows\":50000}"; }

            public void handle(JobContext ctx) throws Exception {
                Simulate.work(1500, 4000);
            }
        };
    }

    @Bean
    JobHandler paymentReconcileHandler() {
        return new JobHandler() {
            public String type() { return "payment.reconcile"; }
            public String description() { return "Reconcile a payment; negative amounts fail permanently (no retry)"; }
            public String examplePayload() { return "{\"transactionId\":\"txn_42\",\"amount\":499}"; }

            public void handle(JobContext ctx) throws Exception {
                Simulate.work(200, 900);
                if (ctx.payload().path("amount").asLong(0) < 0) {
                    throw new NonRetryableJobException("Invalid amount " + ctx.payload().path("amount").asText());
                }
                Simulate.maybeFail(0.05, "Bank API rate limit exceeded");
            }
        };
    }

    @Bean
    JobHandler flakyHandler() {
        return new JobHandler() {
            public String type() { return "demo.flaky"; }
            public String description() { return "Always fails the first 2 attempts, then succeeds — shows backoff in action"; }
            public String examplePayload() { return "{\"note\":\"fails twice, then succeeds\"}"; }

            public void handle(JobContext ctx) throws Exception {
                Simulate.work(100, 300);
                if (ctx.attempt() <= 2) {
                    throw new IllegalStateException("Simulated failure on attempt " + ctx.attempt());
                }
            }
        };
    }
}
