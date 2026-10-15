package com.queueforge.api.dto;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record SubmitJobRequest(
        @Size(max = 64) @Pattern(regexp = "^[a-z0-9._-]*$", message = "queue may contain a-z, 0-9, '.', '_' and '-'")
        String queue,
        @NotBlank @Size(max = 128) String type,
        JsonNode payload,
        @Min(-10) @Max(10) Integer priority,
        @Min(1) @Max(25) Integer maxAttempts,
        @Min(0) @Max(31_536_000) Long delaySeconds,
        @Size(max = 255) String idempotencyKey
) {
}
