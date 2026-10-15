package com.queueforge.api.dto;

import com.fasterxml.jackson.annotation.JsonRawValue;

public record JobTypeInfo(String type, String description, @JsonRawValue String examplePayload) {
}
