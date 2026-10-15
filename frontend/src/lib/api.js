// HTTP client for the Spring Boot API. demo.js implements the same interface in-browser.

const BASE = import.meta.env.VITE_API_BASE ?? ''

async function request(path, { method = 'GET', body, headers } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const problem = await res.json()
      detail = problem.detail || problem.title || detail
    } catch { /* not JSON */ }
    throw new Error(detail)
  }
  if (res.status === 204 || res.status === 202) return { res, data: null }
  return { res, data: await res.json() }
}

const get = async (path) => (await request(path)).data
const post = async (path, body) => (await request(path, { method: 'POST', body })).data

function query(params) {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q.set(k, v)
  })
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const httpApi = {
  mode: 'live',
  stats: () => get('/api/stats'),
  jobs: (params = {}) => get(`/api/jobs${query(params)}`),
  job: (id) => get(`/api/jobs/${id}`),
  async submit(body, idempotencyKey) {
    const { res, data } = await request('/api/jobs', {
      method: 'POST',
      body,
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
    })
    return { job: data, created: res.status === 201 }
  },
  cancel: (id) => post(`/api/jobs/${id}/cancel`),
  retry: (id) => post(`/api/jobs/${id}/retry`),
  retryAllDead: (queue) => post(`/api/jobs/dead/retry-all${query({ queue })}`),
  queues: () => get('/api/queues'),
  pauseQueue: (name) => post(`/api/queues/${encodeURIComponent(name)}/pause`),
  resumeQueue: (name) => post(`/api/queues/${encodeURIComponent(name)}/resume`),
  workers: () => get('/api/workers'),
  jobTypes: () => get('/api/job-types'),
  schedules: () => get('/api/schedules'),
  createSchedule: (body) => post('/api/schedules', body),
  updateSchedule: async (id, body) => (await request(`/api/schedules/${id}`, { method: 'PUT', body })).data,
  setScheduleEnabled: (id, enabled) => post(`/api/schedules/${id}/${enabled ? 'enable' : 'disable'}`),
  triggerSchedule: (id) => post(`/api/schedules/${id}/trigger`),
  deleteSchedule: async (id) => (await request(`/api/schedules/${id}`, { method: 'DELETE' })).data,
  previewCron: (cron) => get(`/api/schedules/preview${query({ cron, count: 5 })}`),
  burst: (count) => post(`/api/demo/burst${query({ count })}`),
  subscribe(onEvent, onStatus) {
    const source = new EventSource(`${BASE}/api/events`)
    source.addEventListener('job', (e) => {
      try { onEvent(JSON.parse(e.data)) } catch { /* ignore malformed */ }
    })
    source.onopen = () => onStatus?.('connected')
    source.onerror = () => onStatus?.('reconnecting')
    return () => source.close()
  },
}

/** Is a backend reachable? Used once at startup to choose live vs demo mode. */
export async function probeBackend(timeoutMs = 1500) {
  if (import.meta.env.VITE_FORCE_DEMO === 'true') return false
  if (new URLSearchParams(window.location.search).has('demo')) return false
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${BASE}/api/job-types`, { signal: ctrl.signal })
    return res.ok && (res.headers.get('content-type') || '').includes('json')
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
