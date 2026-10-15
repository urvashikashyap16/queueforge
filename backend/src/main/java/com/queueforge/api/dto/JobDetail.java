package com.queueforge.api.dto;

import com.queueforge.domain.Job;
import com.queueforge.domain.JobAttempt;

import java.util.List;

public record JobDetail(Job job, List<JobAttempt> attempts) {
}
