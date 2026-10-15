-- QueueForge schema
-- PostgreSQL is the single source of truth: jobs are claimed with
-- SELECT ... FOR UPDATE SKIP LOCKED so many workers can poll safely.

CREATE TABLE queues (
    name        VARCHAR(64) PRIMARY KEY,
    paused      BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE schedules (
    id            UUID PRIMARY KEY,
    name          VARCHAR(128) NOT NULL UNIQUE,
    cron          VARCHAR(128) NOT NULL,
    queue         VARCHAR(64)  NOT NULL,
    type          VARCHAR(128) NOT NULL,
    payload       JSONB        NOT NULL DEFAULT '{}',
    priority      INT          NOT NULL DEFAULT 0,
    max_attempts  INT          NOT NULL DEFAULT 5,
    enabled       BOOLEAN      NOT NULL DEFAULT TRUE,
    next_run_at   TIMESTAMPTZ  NOT NULL,
    last_run_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE jobs (
    id               UUID PRIMARY KEY,
    queue            VARCHAR(64)  NOT NULL,
    type             VARCHAR(128) NOT NULL,
    payload          JSONB        NOT NULL DEFAULT '{}',
    priority         INT          NOT NULL DEFAULT 0,
    status           VARCHAR(16)  NOT NULL,
    attempts         INT          NOT NULL DEFAULT 0,
    max_attempts     INT          NOT NULL DEFAULT 5,
    run_at           TIMESTAMPTZ  NOT NULL,
    locked_by        VARCHAR(128),
    locked_until     TIMESTAMPTZ,
    last_error       TEXT,
    idempotency_key  VARCHAR(255) UNIQUE,
    schedule_id      UUID REFERENCES schedules(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    started_at       TIMESTAMPTZ,
    finished_at      TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_job_status CHECK (status IN ('PENDING','RUNNING','SUCCEEDED','DEAD','CANCELLED'))
);

-- Partial index: the claim query only ever scans ready PENDING jobs.
CREATE INDEX idx_jobs_ready          ON jobs (priority DESC, run_at) WHERE status = 'PENDING';
-- Lease reaper only looks at RUNNING jobs.
CREATE INDEX idx_jobs_lease          ON jobs (locked_until)          WHERE status = 'RUNNING';
CREATE INDEX idx_jobs_status_created ON jobs (status, created_at DESC);
CREATE INDEX idx_jobs_queue          ON jobs (queue);
CREATE INDEX idx_jobs_type           ON jobs (type);

CREATE TABLE job_attempts (
    id           BIGSERIAL PRIMARY KEY,
    job_id       UUID         NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    attempt_no   INT          NOT NULL,
    worker_id    VARCHAR(128) NOT NULL,
    started_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    finished_at  TIMESTAMPTZ,
    outcome      VARCHAR(24),
    error        TEXT,
    duration_ms  BIGINT
);
CREATE INDEX idx_attempts_job      ON job_attempts (job_id, attempt_no);
CREATE INDEX idx_attempts_finished ON job_attempts (finished_at);

CREATE TABLE worker_nodes (
    id           VARCHAR(128) PRIMARY KEY,
    host         VARCHAR(255) NOT NULL,
    concurrency  INT          NOT NULL,
    active       INT          NOT NULL DEFAULT 0,
    processed    BIGINT       NOT NULL DEFAULT 0,
    failed       BIGINT       NOT NULL DEFAULT 0,
    started_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_seen    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

INSERT INTO queues (name) VALUES ('default'), ('emails'), ('reports'), ('webhooks'), ('payments');
