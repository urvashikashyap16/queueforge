// In-browser simulation of the QueueForge backend, used when no API is reachable.
// It mirrors the server's semantics (priorities, paused queues, retries with exponential
// backoff + jitter, dead-lettering, idempotency keys, cron schedules) so the dashboard
// can be demoed anywhere — but nothing here is persisted.

import { nextRun, previewCron, isValidCron } from './cron'

const TYPES = {
  'email.send': {
    queue: 'emails', min: 150, max: 700, fail: 0.05, error: 'SMTP timeout talking to mail provider',
    description: 'Send a transactional email (fails ~5% with SMTP timeouts)',
    example: { to: 'user@example.com', template: 'welcome' },
  },
  'image.resize': {
    queue: 'default', min: 300, max: 1400, fail: 0.04, error: 'Out of memory decoding image',
    description: 'Resize an uploaded image into thumbnails',
    example: { imageId: 'img_123', width: 1280, height: 720 },
  },
  'webhook.deliver': {
    queue: 'webhooks', min: 80, max: 600, fail: 0.12, error: 'Partner endpoint returned HTTP 503',
    description: 'POST an event to a partner endpoint (flaky: ~12% HTTP 503)',
    example: { url: 'https://partner.example.com/hooks', event: 'order.created' },
  },
  'report.generate': {
    queue: 'reports', min: 1500, max: 4000, fail: 0, error: '',
    description: 'Build a CSV report (slow, CPU-heavy)',
    example: { reportType: 'sales', rows: 50000 },
  },
  'payment.reconcile': {
    queue: 'payments', min: 200, max: 900, fail: 0.05, error: 'Bank API rate limit exceeded',
    description: 'Reconcile a payment; negative amounts fail permanently (no retry)',
    example: { transactionId: 'txn_42', amount: 499 },
  },
  'demo.flaky': {
    queue: 'default', min: 100, max: 300, fail: 0, error: '',
    description: 'Always fails the first 2 attempts, then succeeds — shows backoff in action',
    example: { note: 'fails twice, then succeeds' },
  },
}
const WEIGHTS = [['email.send', 35], ['image.resize', 20], ['webhook.deliver', 20], ['report.generate', 10], ['payment.reconcile', 10], ['demo.flaky', 5]]

const rand = (a, b) => a + Math.random() * (b - a)
const randInt = (a, b) => Math.floor(rand(a, b + 1))
const uuid = () => (globalThis.crypto?.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  }))
const iso = (t) => new Date(t).toISOString()
const clone = (x) => JSON.parse(JSON.stringify(x))

function pickType() {
  const total = WEIGHTS.reduce((s, [, w]) => s + w, 0)
  let roll = Math.random() * total
  for (const [t, w] of WEIGHTS) {
    if ((roll -= w) < 0) return t
  }
  return 'email.send'
}

function randomPayload(type) {
  switch (type) {
    case 'email.send': return { to: `user${randInt(1, 9999)}@example.com`, template: Math.random() < 0.5 ? 'welcome' : 'order-confirmation' }
    case 'image.resize': return { imageId: `img_${randInt(1, 99999)}`, width: 1280, height: 720 }
    case 'webhook.deliver': return { url: `https://partner-${randInt(1, 20)}.example.com/hooks`, event: 'order.created' }
    case 'report.generate': return { reportType: Math.random() < 0.5 ? 'sales' : 'inventory', rows: randInt(10000, 100000) }
    case 'payment.reconcile': return { transactionId: `txn_${randInt(1, 999999)}`, amount: Math.random() < 0.08 ? -1 : randInt(100, 9999) }
    default: return { note: 'fails twice, then succeeds' }
  }
}

function backoffMs(attempt) {
  const raw = Math.min(300_000, 2000 * 2 ** Math.min(attempt - 1, 20))
  return Math.max(1000, Math.round(raw * (1 + 0.2 * (2 * Math.random() - 1))))
}

function percentile(sorted, p) {
  if (!sorted.length) return null
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

class Simulator {
  constructor() {
    this.jobs = new Map()
    this.attempts = []
    this.listeners = new Set()
    this.queues = new Map(['default', 'emails', 'payments', 'reports', 'webhooks'].map((q) => [q, { paused: false }]))
    const start = Date.now() - 47 * 60_000
    this.workers = [
      { id: 'ip-10-0-1-24-a91c3f', host: 'ip-10-0-1-24', concurrency: 8, startedAt: iso(start), processed: 0, failed: 0 },
      { id: 'ip-10-0-2-117-4be0d2', host: 'ip-10-0-2-117', concurrency: 8, startedAt: iso(start + 90_000), processed: 0, failed: 0 },
    ]
    this.running = new Map() // jobId -> { workerId, doneAt, attemptId, startedAt }
    this.attemptSeq = 1
    this.schedules = []
    this.seedSchedules()
    this.seedHistory()
    this.lastTraffic = 0
    this.timer = setInterval(() => this.tick(), 200)
  }

  // ---------- seeding ----------

  seedSchedules() {
    const mk = (name, cron, type, queue, payload, priority, maxAttempts) => ({
      id: uuid(), name, cron, queue, type, payload, priority, maxAttempts, enabled: true,
      nextRunAt: nextRun(cron).toISOString(), lastRunAt: null, createdAt: iso(Date.now() - 86_400_000),
    })
    this.schedules = [
      mk('digest-emails', '0 * * * * *', 'email.send', 'emails', { to: 'subscribers@example.com', template: 'digest' }, 0, 3),
      mk('partner-sync', '30 * * * * *', 'webhook.deliver', 'webhooks', { url: 'https://partner.example.com/sync', event: 'inventory.sync' }, 0, 5),
      mk('nightly-sales-report', '0 0 2 * * *', 'report.generate', 'reports', { reportType: 'sales', rows: 250000 }, 5, 3),
    ]
  }

  seedHistory() {
    const now = Date.now()
    for (let m = 30; m >= 1; m--) {
      const wave = 28 + Math.round(18 * Math.sin(m / 4)) + randInt(0, 10)
      for (let i = 0; i < wave; i++) {
        const type = pickType()
        const spec = TYPES[type]
        const created = now - m * 60_000 + rand(0, 55_000)
        const job = this.newJob({ type, queue: spec.queue, payload: randomPayload(type), priority: Math.random() < 0.15 ? 5 : 0, runAt: created, createdAt: created })
        let t = created + rand(20, 400)
        let outcome = 'SUCCEEDED'
        for (let a = 1; a <= job.maxAttempts; a++) {
          const worker = this.workers[randInt(0, 1)]
          const dur = rand(spec.min, spec.max)
          const r = this.decide(job, a)
          this.attempts.push({
            id: this.attemptSeq++, jobId: job.id, attemptNo: a, workerId: worker.id, startedAt: iso(t),
            finishedAt: iso(t + dur), outcome: r.ok ? 'SUCCEEDED' : 'FAILED', error: r.ok ? null : r.error, durationMs: Math.round(dur),
          })
          job.attempts = a
          job.startedAt = iso(t)
          t += dur
          if (r.ok) { worker.processed++; outcome = 'SUCCEEDED'; break }
          worker.failed++
          job.lastError = r.error
          if (!r.retry || a === job.maxAttempts) { outcome = 'DEAD'; job.lastError = (r.retry ? 'Attempts exhausted. ' : 'Non-retryable. ') + r.error; break }
          t += Math.min(backoffMs(a), 20_000)
        }
        job.status = outcome
        job.finishedAt = iso(Math.min(t, now - 1000))
        job.updatedAt = job.finishedAt
        if (outcome === 'SUCCEEDED') job.lastError = null
      }
    }
    // a few jobs waiting in the future (delayed / retry backoff)
    for (let i = 0; i < 6; i++) {
      const type = pickType()
      this.newJob({ type, queue: TYPES[type].queue, payload: randomPayload(type), runAt: now + randInt(20, 240) * 1000 })
    }
  }

  newJob({ type, queue, payload, priority = 0, maxAttempts = 5, runAt = Date.now(), createdAt = Date.now(), idempotencyKey = null, scheduleId = null }) {
    const job = {
      id: uuid(), queue, type, payload, priority, status: 'PENDING', attempts: 0, maxAttempts,
      runAt: iso(runAt), lockedBy: null, lockedUntil: null, lastError: null, idempotencyKey, scheduleId,
      createdAt: iso(createdAt), startedAt: null, finishedAt: null, updatedAt: iso(createdAt),
    }
    this.jobs.set(job.id, job)
    if (!this.queues.has(queue)) this.queues.set(queue, { paused: false })
    return job
  }

  decide(job, attempt) {
    const spec = TYPES[job.type]
    if (job.type === 'payment.reconcile' && Number(job.payload?.amount) < 0) {
      return { ok: false, retry: false, error: `NonRetryableJobException: Invalid amount ${job.payload.amount}` }
    }
    if (job.type === 'email.send' && !job.payload?.to) {
      return { ok: false, retry: false, error: "NonRetryableJobException: Missing 'to' address" }
    }
    if (job.type === 'demo.flaky' && attempt <= 2) {
      return { ok: false, retry: true, error: `IllegalStateException: Simulated failure on attempt ${attempt}` }
    }
    if (Math.random() < spec.fail) return { ok: false, retry: true, error: `TransientFailure: ${spec.error}` }
    return { ok: true }
  }

  // ---------- engine loop ----------

  emit(kind, job, message, workerId = null, durationMs = null) {
    const event = { kind, jobId: job.id, queue: job.queue, type: job.type, attempt: job.attempts, message, workerId, durationMs, at: iso(Date.now()) }
    this.listeners.forEach((fn) => fn(event))
  }

  tick() {
    const now = Date.now()

    // 1. cron schedules
    for (const s of this.schedules) {
      if (s.enabled && new Date(s.nextRunAt).getTime() <= now) {
        this.enqueue({ type: s.type, queue: s.queue, payload: clone(s.payload), priority: s.priority, maxAttempts: s.maxAttempts, scheduleId: s.id, idempotencyKey: `schedule:${s.id}:${new Date(s.nextRunAt).getTime()}` })
        s.lastRunAt = s.nextRunAt
        s.nextRunAt = nextRun(s.cron, new Date(now)).toISOString()
      }
    }

    // 2. finish running jobs
    for (const [id, r] of this.running) {
      if (r.doneAt > now) continue
      this.running.delete(id)
      const job = this.jobs.get(id)
      const worker = this.workers.find((w) => w.id === r.workerId)
      const attempt = this.attempts.find((a) => a.id === r.attemptId)
      const dur = Math.round(now - r.startedAt)
      const result = this.decide(job, job.attempts)
      Object.assign(attempt, { finishedAt: iso(now), durationMs: dur, outcome: result.ok ? 'SUCCEEDED' : 'FAILED', error: result.ok ? null : result.error })
      Object.assign(job, { lockedBy: null, lockedUntil: null, updatedAt: iso(now) })
      if (result.ok) {
        worker.processed++
        Object.assign(job, { status: 'SUCCEEDED', finishedAt: iso(now), lastError: null })
        this.emit('SUCCEEDED', job, `Completed in ${dur} ms`, worker.id, dur)
      } else {
        worker.failed++
        if (result.retry && job.attempts < job.maxAttempts) {
          const delay = backoffMs(job.attempts)
          Object.assign(job, { status: 'PENDING', runAt: iso(now + delay), lastError: result.error })
          this.emit('RETRY_SCHEDULED', job, `${result.error} — retrying in ${Math.round(delay / 1000)}s`, worker.id, dur)
        } else {
          const reason = (result.retry ? 'Attempts exhausted. ' : 'Non-retryable. ') + result.error
          Object.assign(job, { status: 'DEAD', finishedAt: iso(now), lastError: reason })
          this.emit('DEAD', job, reason, worker.id, dur)
        }
      }
    }

    // 3. claim ready jobs (priority desc, run_at asc), skipping paused queues
    const busy = (w) => [...this.running.values()].filter((r) => r.workerId === w.id).length
    let free = this.workers.reduce((s, w) => s + (w.concurrency - busy(w)), 0)
    if (free > 0) {
      const ready = [...this.jobs.values()]
        .filter((j) => j.status === 'PENDING' && new Date(j.runAt).getTime() <= now && !this.queues.get(j.queue)?.paused)
        .sort((a, b) => b.priority - a.priority || new Date(a.runAt) - new Date(b.runAt))
      for (const job of ready) {
        if (free <= 0) break
        const worker = this.workers.filter((w) => busy(w) < w.concurrency).sort((a, b) => busy(a) - busy(b))[0]
        if (!worker) break
        const spec = TYPES[job.type]
        job.attempts++
        Object.assign(job, { status: 'RUNNING', lockedBy: worker.id, lockedUntil: iso(now + 30_000), startedAt: iso(now), updatedAt: iso(now) })
        const attemptId = this.attemptSeq++
        this.attempts.push({ id: attemptId, jobId: job.id, attemptNo: job.attempts, workerId: worker.id, startedAt: iso(now), finishedAt: null, outcome: null, error: null, durationMs: null })
        this.running.set(job.id, { workerId: worker.id, doneAt: now + rand(spec.min, spec.max), attemptId, startedAt: now })
        this.emit('STARTED', job, `Attempt ${job.attempts}/${job.maxAttempts}`, worker.id)
        free--
      }
    }

    // 4. steady background traffic so the demo always looks alive
    if (now - this.lastTraffic > 1000) {
      this.lastTraffic = now
      for (let i = 0, n = randInt(2, 6); i < n; i++) this.enqueueRandom()
    }

    // 5. housekeeping: keep memory bounded
    if (this.jobs.size > 6000) {
      const finished = [...this.jobs.values()].filter((j) => ['SUCCEEDED', 'CANCELLED'].includes(j.status))
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      finished.slice(0, this.jobs.size - 5000).forEach((j) => this.jobs.delete(j.id))
      const keep = new Set(this.jobs.keys())
      this.attempts = this.attempts.filter((a) => keep.has(a.jobId))
    }
  }

  enqueueRandom(delayed = false) {
    const type = pickType()
    return this.enqueue({
      type, queue: TYPES[type].queue, payload: randomPayload(type),
      priority: Math.random() < 0.15 ? 5 : 0,
      delaySeconds: delayed && Math.random() < 0.1 ? randInt(5, 60) : 0,
    })
  }

  enqueue({ type, queue, payload, priority = 0, maxAttempts = 5, delaySeconds = 0, idempotencyKey = null, scheduleId = null }) {
    if (idempotencyKey) {
      const existing = [...this.jobs.values()].find((j) => j.idempotencyKey === idempotencyKey)
      if (existing) return { job: existing, created: false }
    }
    const job = this.newJob({ type, queue: queue || 'default', payload: payload ?? {}, priority, maxAttempts, runAt: Date.now() + delaySeconds * 1000, idempotencyKey, scheduleId })
    this.emit('ENQUEUED', job, delaySeconds > 0 ? `Scheduled for ${job.runAt}` : 'Enqueued')
    return { job, created: true }
  }

  // ---------- read models ----------

  stats() {
    const now = Date.now()
    const statusCounts = { PENDING: 0, RUNNING: 0, SUCCEEDED: 0, DEAD: 0, CANCELLED: 0 }
    for (const j of this.jobs.values()) statusCounts[j.status]++

    const recent = this.attempts.filter((a) => a.finishedAt && now - new Date(a.finishedAt).getTime() < 15 * 60_000)
    const ok = recent.filter((a) => a.outcome === 'SUCCEEDED')
    const bad = recent.length - ok.length
    const durations = ok.map((a) => a.durationMs).sort((a, b) => a - b)

    const end = Math.floor(now / 60_000) * 60_000
    const buckets = new Map()
    for (let i = 29; i >= 0; i--) buckets.set(end - i * 60_000, { succeeded: 0, failed: 0 })
    for (const a of this.attempts) {
      if (!a.finishedAt) continue
      const minute = Math.floor(new Date(a.finishedAt).getTime() / 60_000) * 60_000
      const b = buckets.get(minute)
      if (b) a.outcome === 'SUCCEEDED' ? b.succeeded++ : b.failed++
    }

    const pending = [...this.jobs.values()].filter((j) => j.status === 'PENDING' && new Date(j.runAt).getTime() <= now)
    const oldest = pending.length ? (now - Math.min(...pending.map((j) => new Date(j.runAt).getTime()))) / 1000 : null

    const byType = Object.keys(TYPES).map((type) => {
      const js = [...this.jobs.values()].filter((j) => j.type === type)
      const ids = new Set(js.map((j) => j.id))
      const d = this.attempts.filter((a) => ids.has(a.jobId) && a.outcome === 'SUCCEEDED')
      return {
        type, total: js.length,
        succeeded: js.filter((j) => j.status === 'SUCCEEDED').length,
        dead: js.filter((j) => j.status === 'DEAD').length,
        avgMs: d.length ? d.reduce((s, a) => s + a.durationMs, 0) / d.length : null,
      }
    }).sort((a, b) => b.total - a.total)

    return clone({
      statusCounts,
      successRate15m: ok.length + bad === 0 ? 1 : ok.length / (ok.length + bad),
      completedLastMinute: ok.filter((a) => now - new Date(a.finishedAt).getTime() < 60_000).length,
      p50Ms: percentile(durations, 0.5),
      p95Ms: percentile(durations, 0.95),
      p99Ms: percentile(durations, 0.99),
      oldestPendingSeconds: oldest,
      throughput: [...buckets.entries()].map(([m, v]) => ({ minute: iso(m), ...v })),
      byType,
      queues: this.queueSummaries(),
      workers: this.workerNodes(),
      generatedAt: iso(now),
    })
  }

  queueSummaries() {
    const now = Date.now()
    return [...this.queues.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, q]) => {
      const js = [...this.jobs.values()].filter((j) => j.queue === name)
      const ready = js.filter((j) => j.status === 'PENDING' && new Date(j.runAt).getTime() <= now)
      return {
        name, paused: q.paused,
        pending: js.filter((j) => j.status === 'PENDING').length,
        running: js.filter((j) => j.status === 'RUNNING').length,
        succeeded: js.filter((j) => j.status === 'SUCCEEDED').length,
        dead: js.filter((j) => j.status === 'DEAD').length,
        oldestPendingSeconds: ready.length ? (now - Math.min(...ready.map((j) => new Date(j.runAt).getTime()))) / 1000 : null,
      }
    })
  }

  workerNodes() {
    return this.workers.map((w) => ({
      ...w,
      active: [...this.running.values()].filter((r) => r.workerId === w.id).length,
      lastSeen: iso(Date.now() - randInt(0, 4000)),
      alive: true,
    }))
  }
}

let sim = null
const engine = () => (sim ??= new Simulator())
const wait = (v) => new Promise((resolve) => setTimeout(() => resolve(clone(v)), 60))
const fail = (msg) => Promise.reject(new Error(msg))

export const demoApi = {
  mode: 'demo',
  stats: () => wait(engine().stats()),
  jobs({ status, queue, type, q, page = 0, size = 25 } = {}) {
    let list = [...engine().jobs.values()]
    if (status) list = list.filter((j) => j.status === status)
    if (queue) list = list.filter((j) => j.queue === queue)
    if (type) list = list.filter((j) => j.type === type)
    if (q) {
      const needle = q.toLowerCase()
      list = list.filter((j) => j.id.includes(needle) || j.idempotencyKey?.toLowerCase().includes(needle) || j.lastError?.toLowerCase().includes(needle))
    }
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    return wait({ items: list.slice(page * size, page * size + size), page, size, total: list.length })
  },
  job(id) {
    const job = engine().jobs.get(id)
    if (!job) return fail(`Job ${id} not found`)
    return wait({ job, attempts: engine().attempts.filter((a) => a.jobId === id).sort((a, b) => a.attemptNo - b.attemptNo) })
  },
  submit(body, idempotencyKey) {
    if (!TYPES[body.type]) return fail(`Unknown job type '${body.type}'`)
    const r = engine().enqueue({ ...body, idempotencyKey: idempotencyKey || body.idempotencyKey || null })
    return wait(r)
  },
  cancel(id) {
    const job = engine().jobs.get(id)
    if (!job) return fail('Job not found')
    if (job.status !== 'PENDING') return fail(`Only PENDING jobs can be cancelled (job is ${job.status})`)
    Object.assign(job, { status: 'CANCELLED', finishedAt: iso(Date.now()), updatedAt: iso(Date.now()) })
    engine().emit('CANCELLED', job, 'Cancelled by user')
    return wait(job)
  },
  retry(id) {
    const job = engine().jobs.get(id)
    if (!job) return fail('Job not found')
    if (!['DEAD', 'CANCELLED'].includes(job.status)) return fail(`Only DEAD or CANCELLED jobs can be retried (job is ${job.status})`)
    Object.assign(job, { status: 'PENDING', attempts: 0, runAt: iso(Date.now()), lastError: null, finishedAt: null })
    engine().emit('REQUEUED', job, 'Manually re-queued')
    return wait(job)
  },
  retryAllDead(queue) {
    let n = 0
    for (const job of engine().jobs.values()) {
      if (job.status === 'DEAD' && (!queue || job.queue === queue)) {
        Object.assign(job, { status: 'PENDING', attempts: 0, runAt: iso(Date.now()), lastError: null, finishedAt: null })
        n++
      }
    }
    return wait({ requeued: n })
  },
  queues: () => wait(engine().queueSummaries()),
  pauseQueue(name) { engine().queues.get(name).paused = true; return wait(engine().queueSummaries()) },
  resumeQueue(name) { engine().queues.get(name).paused = false; return wait(engine().queueSummaries()) },
  workers: () => wait(engine().workerNodes()),
  jobTypes: () => wait(Object.entries(TYPES).map(([type, t]) => ({ type, description: t.description, examplePayload: t.example }))),
  schedules: () => wait([...engine().schedules].sort((a, b) => a.name.localeCompare(b.name))),
  createSchedule(body) {
    if (!isValidCron(body.cron)) return fail(`Invalid cron expression: ${body.cron}`)
    if (engine().schedules.some((s) => s.name === body.name)) return fail(`A schedule named '${body.name}' already exists`)
    const s = {
      id: uuid(), name: body.name, cron: body.cron, queue: body.queue || 'default', type: body.type,
      payload: body.payload ?? {}, priority: body.priority ?? 0, maxAttempts: body.maxAttempts ?? 5,
      enabled: body.enabled ?? true, nextRunAt: nextRun(body.cron).toISOString(), lastRunAt: null, createdAt: iso(Date.now()),
    }
    engine().schedules.push(s)
    return wait(s)
  },
  updateSchedule(id, body) {
    const s = engine().schedules.find((x) => x.id === id)
    if (!s) return fail('Schedule not found')
    if (!isValidCron(body.cron)) return fail(`Invalid cron expression: ${body.cron}`)
    Object.assign(s, body, { nextRunAt: nextRun(body.cron).toISOString() })
    return wait(s)
  },
  setScheduleEnabled(id, enabled) {
    const s = engine().schedules.find((x) => x.id === id)
    s.enabled = enabled
    s.nextRunAt = nextRun(s.cron).toISOString()
    return wait(s)
  },
  triggerSchedule(id) {
    const s = engine().schedules.find((x) => x.id === id)
    engine().enqueue({ type: s.type, queue: s.queue, payload: clone(s.payload), priority: s.priority, maxAttempts: s.maxAttempts, scheduleId: s.id, idempotencyKey: `schedule:${s.id}:${Date.now()}` })
    return wait(null)
  },
  deleteSchedule(id) {
    engine().schedules = engine().schedules.filter((s) => s.id !== id)
    return wait(null)
  },
  previewCron(cron) {
    try { return wait(previewCron(cron)) } catch (e) { return fail(`Invalid cron expression: ${cron}`) }
  },
  burst(count) {
    const n = Math.min(Math.max(count, 1), 2000)
    for (let i = 0; i < n; i++) engine().enqueueRandom(true)
    return wait({ enqueued: n })
  },
  subscribe(onEvent, onStatus) {
    engine().listeners.add(onEvent)
    onStatus?.('connected')
    return () => engine().listeners.delete(onEvent)
  },
}
