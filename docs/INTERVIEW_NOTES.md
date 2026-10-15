# QueueForge: resume bullets and interview prep

## Resume bullets

Only claim what you have run yourself. After `docker compose up --scale backend=3` and `mvn verify` pass on your machine, everything below is true. If you deploy to AWS, keep the AWS line; otherwise drop it.

**For a Java backend resume**

**QueueForge — Distributed Job Queue & Scheduler** | Java 21, Spring Boot 3, PostgreSQL, React, Docker
- Built a multi-instance background job queue on PostgreSQL using `FOR UPDATE SKIP LOCKED` claiming; integration tests with 8 concurrent workers confirm every job is processed exactly once per attempt.
- Implemented retries with exponential backoff and jitter, a dead-letter queue, idempotent enqueue via unique-key `ON CONFLICT`, and lease-based crash recovery with fenced completion so stale workers can't overwrite results.
- Added cron scheduling that fires each tick exactly once across instances, graceful shutdown, Micrometer/Prometheus metrics and a live React dashboard streamed over Server-Sent Events.

**For a Cloud / DevOps resume**

**QueueForge — Distributed Job Queue on AWS** | Terraform, ECS Fargate, RDS, ALB, GitHub Actions, Docker
- Provisioned the full stack with Terraform: VPC with private subnets, encrypted RDS PostgreSQL, ECS Fargate services behind an ALB, Secrets Manager for credentials, CloudWatch logging and CPU-based autoscaling of worker tasks.
- Built a CI/CD pipeline in GitHub Actions (OIDC, no long-lived keys) that runs Testcontainers integration tests, pushes images to ECR and performs rolling deploys with automatic rollback via the ECS circuit breaker.
- Designed the service to scale horizontally with no coordinator: adding tasks adds workers that claim from the same PostgreSQL queue safely.

## The 60-second pitch

"QueueForge is a background job system, like a small Sidekiq or SQS, built on Spring Boot and PostgreSQL. Apps submit jobs such as sending emails or generating reports, and a pool of workers across any number of instances processes them. The interesting problems are concurrency and failure. Two workers must never grab the same job, so I use `SELECT … FOR UPDATE SKIP LOCKED`. Workers can crash, so jobs are leased, the lease is renewed by heartbeat, and expired leases get recovered. Jobs fail, so there are retries with exponential backoff and a dead-letter queue. Clients retry requests, so enqueue is idempotent. And there's a live dashboard showing all of it, plus Terraform to deploy it on ECS."

## Questions you should expect

**1. How do you stop two workers from processing the same job?**
Claiming is a single `UPDATE … FROM (SELECT … FOR UPDATE SKIP LOCKED)`. The inner select locks the rows it picks. Another worker's select running at the same moment skips locked rows instead of waiting, so it picks different jobs. The update flips them to `RUNNING` in the same statement, so there's no window between "picked" and "marked". The integration test races 8 workers over 500 jobs and asserts every job ID was claimed exactly once.

**2. Why not plain `FOR UPDATE`?**
Without `SKIP LOCKED` the second worker blocks until the first commits, then re-checks the rows and finds them taken. Workers end up queueing behind each other and throughput collapses. `SKIP LOCKED` exists precisely for queue tables.

**3. What happens if a worker crashes halfway through a job?**
The job has `locked_until`. Running workers extend it every 10 seconds; a crashed one can't. Every 5 seconds, any instance runs the reaper, which moves expired `RUNNING` jobs back to `PENDING`, or to `DEAD` if that was the last attempt. Graceful shutdowns (deploys) don't even wait for that: the worker finishes in-flight jobs for up to 20 seconds, then hands back anything unfinished immediately.

**4. What if the "crashed" worker was just slow and comes back?**
That's why completion is fenced. The update is `WHERE id = ? AND locked_by = :me AND attempts = :myAttempt`. If the job was reaped and re-claimed, `attempts` has changed, so the stale worker updates zero rows and its result is discarded. This is the fencing-token idea from distributed locking.

**5. Is it exactly-once?**
No, at-least-once, and that's deliberate. If a worker sends an email and crashes before marking the job done, the job runs again. Exactly-once across that boundary isn't possible without the side effect itself being idempotent, so handlers must be idempotent, for example using an idempotency key with the email provider. SQS standard queues and Sidekiq make the same guarantee.

**6. How does idempotent enqueue work?**
The `jobs.idempotency_key` column has a unique index. The insert uses `ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`. If no row comes back, someone already created it, so I fetch and return that job with HTTP 200 instead of 201. The database arbitrates, so two simultaneous requests can't both create a job.

**7. Why exponential backoff, and why jitter?**
If a dependency is down, retrying immediately just adds load. Doubling the delay gives it room to recover. Jitter (±20%) matters when many jobs failed at the same moment: without it they'd all retry at the same instant and could knock the dependency over again (a thundering herd).

**8. How do cron schedules avoid firing twice when you run 5 instances?**
Due schedules are selected `FOR UPDATE SKIP LOCKED` inside a transaction that also enqueues the job and advances `next_run_at`. Only one instance gets the row. As a second safety net, the job's idempotency key is `schedule:{id}:{fireTime}`, so even a retried transaction can't create a duplicate for the same tick.

**9. Why PostgreSQL and not Kafka or RabbitMQ?**
Fewer moving parts: one database instead of a database plus a broker. Enqueueing can be in the same transaction as the business write. For example, "create order" and "send confirmation email" commit together or not at all. Kafka can't give you that without an outbox pattern. Job history is also just SQL. The trade-off is ceiling throughput; at very high volume a dedicated broker is the right call.

**10. How does it scale?**
Horizontally, with no coordinator. Each instance is identical, and adding one adds a worker pool that claims from the same table. On AWS, ECS autoscaling adds tasks when CPU passes 60%. The database is the shared bottleneck, so indexes matter: a partial index on pending jobs keeps the claim query fast even with millions of finished rows.

**11. Why do workers only claim as many jobs as they have free threads?**
If a worker grabbed 100 jobs with 8 threads, 92 would sit locked and idle while other workers starve, and their leases could even expire. Claiming exactly "free capacity" keeps load balanced across instances.

**12. Why JdbcTemplate instead of JPA/Hibernate?**
The correctness of the queue lives in the SQL: `SKIP LOCKED`, `ON CONFLICT`, guarded updates with `RETURNING`. With JPA those would be native queries anyway, plus an entity cache that could hold stale job state. Plain SQL makes every state transition explicit and reviewable.

**13. How does the dashboard update live?**
Server-Sent Events. Each instance keeps a list of `SseEmitter`s and pushes job lifecycle events, with a keep-alive comment every 15 seconds so load balancers don't drop idle connections. SSE fits because traffic is one-way (server to browser) and it reconnects automatically. One limitation: an instance only streams events it produced. A fix is Postgres `LISTEN/NOTIFY` to fan events out across instances.

**14. What would you improve next?**
`LISTEN/NOTIFY` to wake workers instantly instead of polling every 500 ms; per-queue concurrency and rate limits; a retention job that archives finished jobs; authentication on the API and dashboard.

**15. How did you test it?**
Unit tests for the backoff maths, and Testcontainers integration tests against real PostgreSQL 16 for the concurrency race, priority ordering, paused queues, idempotency, fencing and lease expiry. CI runs them on every push.

## Live demo script (2 minutes)

1. Open the dashboard. Point at the pipeline: waiting → running → succeeded / dead letter.
2. Click **Send 200 test jobs**. Sparks flow, Running fills to capacity, throughput rises.
3. Open a `demo.flaky` job: show attempt 1 and 2 failing and the growing gap between them (backoff), then success.
4. Pause the `emails` queue: its depth grows while other queues keep draining. Resume it.
5. Open **Dead letter**: failures grouped by cause. Retry them.
6. Open **Schedules**: type a cron expression and show the live next-run preview.
7. If running with Docker: `docker compose up --scale backend=3`, then show three workers sharing the load on the Workers page. Kill one container mid-load and show its jobs being recovered.
