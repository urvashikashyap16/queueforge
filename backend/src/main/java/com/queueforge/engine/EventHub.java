package com.queueforge.engine;

import com.queueforge.domain.JobEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/** Fan-out of job lifecycle events to connected dashboards via Server-Sent Events. */
@Component
public class EventHub {

    private static final Logger log = LoggerFactory.getLogger(EventHub.class);

    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();

    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(0L); // no timeout; client reconnects automatically
        emitters.add(emitter);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError(e -> emitters.remove(emitter));
        try {
            emitter.send(SseEmitter.event().name("hello").data("connected"));
        } catch (IOException e) {
            emitters.remove(emitter);
        }
        return emitter;
    }

    public void publish(JobEvent event) {
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().name("job").data(event));
            } catch (Exception e) {
                emitters.remove(emitter);
                log.debug("Dropping SSE subscriber: {}", e.getMessage());
            }
        }
    }

    /** Keep proxies/load balancers from closing idle SSE connections. */
    @Scheduled(fixedDelay = 15_000)
    public void keepAlive() {
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().comment("ping"));
            } catch (Exception e) {
                emitters.remove(emitter);
            }
        }
    }

    public int subscriberCount() {
        return emitters.size();
    }
}
