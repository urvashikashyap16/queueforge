package com.queueforge.engine;

import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;

/** Spring injects every JobHandler bean; we index them by type (strategy pattern). */
@Component
public class HandlerRegistry {

    private final Map<String, JobHandler> handlers = new TreeMap<>();

    public HandlerRegistry(List<JobHandler> all) {
        for (JobHandler h : all) {
            JobHandler previous = handlers.put(h.type(), h);
            if (previous != null) {
                throw new IllegalStateException("Duplicate job handler for type " + h.type());
            }
        }
    }

    public Optional<JobHandler> find(String type) {
        return Optional.ofNullable(handlers.get(type));
    }

    public boolean supports(String type) {
        return handlers.containsKey(type);
    }

    public Collection<JobHandler> all() {
        return handlers.values();
    }
}
