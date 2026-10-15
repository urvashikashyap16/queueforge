import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Ban, Copy, RotateCcw, X } from 'lucide-react'
import { useApi, useNow, usePolling } from '../lib/context'
import { dateTime, ms, prettyJson, relative } from '../lib/format'
import { useToast } from '../lib/toast'
import StatusBadge from './StatusBadge'

/** The drawer is driven by ?job=<id>, so any job view is a shareable link. */
export function useOpenJob() {
  const [params, setParams] = useSearchParams()
  return useCallback((id) => {
    const next = new URLSearchParams(params)
    if (id) next.set('job', id)
    else next.delete('job')
    setParams(next)
  }, [params, setParams])
}

const OUTCOME = {
  SUCCEEDED: 'text-patina',
  FAILED: 'text-oxblood',
  LEASE_EXPIRED: 'text-molten',
  STALE: 'text-steel',
  INTERRUPTED: 'text-steel',
}

function Fact({ label, children }) {
  return (
    <div>
      <dt className="text-xs text-steel">{label}</dt>
      <dd className="mt-0.5 break-words text-sm">{children}</dd>
    </div>
  )
}

function DrawerBody({ id, onClose }) {
  const { api } = useApi()
  const toast = useToast()
  const now = useNow()
  const [acting, setActing] = useState(false)
  const { data, error, reload } = usePolling((a) => a.job(id), { interval: 1500, deps: [id] })

  if (error && !data) {
    return <p className="p-5 text-sm text-oxblood">Couldn’t load job {id}: {error.message}</p>
  }
  if (!data) return <p className="p-5 text-sm text-steel">Loading job…</p>

  const { job, attempts } = data

  async function act(fn, done) {
    setActing(true)
    try {
      await fn()
      toast(done, 'success')
      reload()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setActing(false)
    }
  }

  return (
    <>
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <div className="text-xl font-semibold">{job.type}</div>
          <button
            type="button"
            className="mt-0.5 inline-flex items-center gap-1 font-mono text-xs text-steel hover:text-ink"
            onClick={() => { navigator.clipboard?.writeText(job.id); toast('Job ID copied') }}
          >
            {job.id} <Copy size={12} aria-hidden="true" />
          </button>
        </div>
        <button type="button" onClick={onClose} className="rounded p-1 text-steel hover:bg-sunk" aria-label="Close job details">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StatusBadge job={job} />
          <div className="flex gap-2">
            {job.status === 'PENDING' && (
              <button type="button" className="btn-danger" disabled={acting} onClick={() => act(() => api.cancel(job.id), 'Job cancelled')}>
                <Ban size={14} /> Cancel job
              </button>
            )}
            {(job.status === 'DEAD' || job.status === 'CANCELLED') && (
              <button type="button" className="btn-primary" disabled={acting} onClick={() => act(() => api.retry(job.id), 'Job re-queued')}>
                <RotateCcw size={14} /> Retry job
              </button>
            )}
          </div>
        </div>

        {job.lastError && (
          <div className="mt-4 rounded border border-oxblood/30 bg-oxblood/5 px-3 py-2.5">
            <div className="text-xs font-medium text-oxblood">Last error</div>
            <div className="mt-0.5 font-mono text-xs leading-relaxed">{job.lastError}</div>
          </div>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
          <Fact label="Queue">{job.queue}</Fact>
          <Fact label="Priority">{job.priority}</Fact>
          <Fact label="Attempts">{job.attempts} of {job.maxAttempts}</Fact>
          <Fact label={job.status === 'PENDING' ? 'Runs' : 'Run at'}>
            {job.status === 'PENDING' ? relative(job.runAt, now) : dateTime(job.runAt)}
          </Fact>
          <Fact label="Created">{dateTime(job.createdAt)}</Fact>
          <Fact label="Finished">{dateTime(job.finishedAt)}</Fact>
          {job.lockedBy && <Fact label="Claimed by">{job.lockedBy}</Fact>}
          {job.lockedUntil && <Fact label="Lease expires">{relative(job.lockedUntil, now)}</Fact>}
          {job.idempotencyKey && <Fact label="Idempotency key"><span className="font-mono text-xs">{job.idempotencyKey}</span></Fact>}
        </dl>

        <h3 className="mt-6 text-sm font-semibold">Payload</h3>
        <pre className="mt-1.5 max-h-56 overflow-auto rounded bg-sunk p-3 font-mono text-xs leading-relaxed">{prettyJson(job.payload)}</pre>

        <h3 className="mt-6 text-sm font-semibold">Attempt history</h3>
        {attempts.length === 0 ? (
          <p className="mt-1.5 text-sm text-steel">No attempts yet. A worker will claim this job when it reaches the front of the queue.</p>
        ) : (
          <ol className="mt-2 border-l border-line pl-4">
            {attempts.map((a) => (
              <li key={a.id} className="relative pb-4 last:pb-0">
                <span
                  className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-panel ${
                    a.outcome === 'SUCCEEDED' ? 'bg-patina' : a.outcome ? 'bg-oxblood' : 'bg-molten'
                  }`}
                  aria-hidden="true"
                />
                <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium">Attempt {a.attemptNo}</span>
                  <span className={OUTCOME[a.outcome] ?? 'text-molten'}>
                    {a.outcome ? a.outcome.toLowerCase().replace('_', ' ') : 'running'}
                  </span>
                  <span className="text-steel">{a.durationMs != null ? ms(a.durationMs) : ''}</span>
                </div>
                <div className="text-xs text-steel">{dateTime(a.startedAt)} on {a.workerId}</div>
                {a.error && <div className="mt-1 font-mono text-xs text-oxblood">{a.error}</div>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  )
}

export default function JobDrawer() {
  const [params] = useSearchParams()
  const id = params.get('job')
  const openJob = useOpenJob()
  const panelRef = useRef(null)
  const close = useCallback(() => openJob(null), [openJob])

  useEffect(() => {
    if (!id) return undefined
    panelRef.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id, close])

  if (!id) return null
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-ink/25" onClick={close} aria-hidden="true" />
      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-label="Job details"
        className="relative flex h-full w-full max-w-lg flex-col border-l border-line bg-panel shadow-2xl outline-none"
      >
        <DrawerBody key={id} id={id} onClose={close} />
      </aside>
    </div>
  )
}
