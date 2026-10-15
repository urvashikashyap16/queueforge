import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import Layout from '../components/Layout'
import { useOpenJob } from '../components/JobDrawer'
import { useApi, useNow, usePolling } from '../lib/context'
import { relative, shortId } from '../lib/format'
import { useToast } from '../lib/toast'

/** Group dead jobs by their failure so one root cause shows up as one row of work. */
function groupByCause(jobs) {
  const groups = new Map()
  for (const j of jobs) {
    const cause = (j.lastError ?? 'Unknown error').replace(/(txn|img)_\d+/g, '$1_…').replace(/-?\d+(\.\d+)?/g, 'N')
    const key = `${j.type}|${cause}`
    if (!groups.has(key)) groups.set(key, { type: j.type, cause: j.lastError, jobs: [] })
    groups.get(key).jobs.push(j)
  }
  return [...groups.values()].sort((a, b) => b.jobs.length - a.jobs.length)
}

export default function DeadLetter() {
  const { api } = useApi()
  const toast = useToast()
  const openJob = useOpenJob()
  const now = useNow(5000)
  const [busy, setBusy] = useState(false)
  const { data, reload } = usePolling((a) => a.jobs({ status: 'DEAD', size: 200 }), { interval: 4000 })
  const jobs = data?.items ?? []
  const groups = groupByCause(jobs)

  async function retry(fn, message) {
    setBusy(true)
    try {
      const r = await fn()
      toast(typeof message === 'function' ? message(r) : message, 'success')
      reload()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Layout
      title="Dead letter"
      description="Jobs that failed permanently: either they ran out of attempts or hit an error that retrying can't fix. Fix the cause, then retry them."
      actions={jobs.length > 0 && (
        <button
          type="button"
          className="btn-danger"
          disabled={busy}
          onClick={() => retry(() => api.retryAllDead(), (r) => `Re-queued ${r.requeued} jobs`)}
        >
          <RotateCcw size={14} /> Retry all {data?.total ?? ''}
        </button>
      )}
    >
      {groups.length === 0 ? (
        <div className="panel px-6 py-12 text-center">
          <p className="text-lg font-semibold">The dead letter queue is empty</p>
          <p className="mt-1 text-steel">Jobs land here only after their last attempt fails or they raise a non-retryable error.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={`${g.type}-${g.cause}`} className="panel" aria-label={`${g.type} failures`}>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-lg font-semibold">{g.type}</h2>
                    <span className="text-sm text-steel">{g.jobs.length} {g.jobs.length === 1 ? 'job' : 'jobs'}</span>
                  </div>
                  <p className="mt-0.5 font-mono text-xs text-oxblood">{g.cause}</p>
                </div>
                <button
                  type="button"
                  className="btn-quiet"
                  disabled={busy}
                  onClick={() => retry(() => Promise.all(g.jobs.map((j) => api.retry(j.id))), `Re-queued ${g.jobs.length} ${g.type} jobs`)}
                >
                  <RotateCcw size={14} /> Retry these
                </button>
              </div>
              <ul>
                {g.jobs.slice(0, 8).map((j) => (
                  <li key={j.id} className="flex items-center gap-4 border-b border-line px-4 py-2 text-sm last:border-b-0">
                    <button type="button" className="font-mono text-xs hover:underline" onClick={() => openJob(j.id)}>{shortId(j.id)}</button>
                    <span className="text-steel">{j.queue}</span>
                    <span className="text-steel">{j.attempts} of {j.maxAttempts} attempts</span>
                    <span className="ml-auto text-steel">died {relative(j.finishedAt, now)}</span>
                  </li>
                ))}
                {g.jobs.length > 8 && (
                  <li className="px-4 py-2 text-sm text-steel">and {g.jobs.length - 8} more with the same error</li>
                )}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Layout>
  )
}
