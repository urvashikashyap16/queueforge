import Layout from '../components/Layout'
import { useNow, usePolling } from '../lib/context'
import { compact, pct, relative } from '../lib/format'

function uptime(startedAt, now) {
  const s = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`
}

/** One block per worker thread: lit blocks are threads currently running a job. */
function Slots({ active, total }) {
  return (
    <div className="flex flex-wrap gap-1" role="img" aria-label={`${active} of ${total} threads busy`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`h-6 w-3.5 rounded-sm ${i < active ? 'bg-molten' : 'bg-sunk'}`} />
      ))}
    </div>
  )
}

export default function Workers() {
  const now = useNow()
  const { data: workers } = usePolling((api) => api.workers(), { interval: 2000 })
  const list = workers ?? []
  const live = list.filter((w) => w.alive)
  const busy = live.reduce((s, w) => s + w.active, 0)
  const slots = live.reduce((s, w) => s + w.concurrency, 0)

  return (
    <Layout
      title="Workers"
      description="Every app instance runs a worker pool. Workers heartbeat every 10 seconds; if one goes silent, its jobs' leases expire and other workers pick them up."
    >
      <p className="mb-4 text-steel">
        <span className="font-semibold text-ink">{live.length}</span> live {live.length === 1 ? 'instance' : 'instances'} using{' '}
        <span className="font-semibold text-ink">{busy}</span> of {slots} threads ({slots ? pct(busy / slots) : '—'} utilisation).
      </p>
      <div className="space-y-3">
        {list.map((w) => (
          <section key={w.id} className={`panel px-4 py-3.5 ${w.alive ? '' : 'opacity-60'}`} aria-label={`Worker ${w.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${w.alive ? 'bg-patina' : 'bg-oxblood'}`} aria-hidden="true" />
                  <h2 className="text-lg font-semibold">{w.host}</h2>
                  <span className="text-sm text-steel">{w.alive ? 'Live' : 'Stopped responding'}</span>
                </div>
                <div className="mt-0.5 font-mono text-xs text-steel">{w.id}</div>
              </div>
              <dl className="grid grid-cols-4 gap-x-6 text-sm">
                <div><dt className="text-xs text-steel">Processed</dt><dd className="font-semibold tabular-nums">{compact(w.processed)}</dd></div>
                <div><dt className="text-xs text-steel">Failed attempts</dt><dd className="font-semibold tabular-nums">{compact(w.failed)}</dd></div>
                <div><dt className="text-xs text-steel">Uptime</dt><dd className="font-semibold tabular-nums">{uptime(w.startedAt, now)}</dd></div>
                <div><dt className="text-xs text-steel">Heartbeat</dt><dd className="font-semibold tabular-nums">{relative(w.lastSeen, now)}</dd></div>
              </dl>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <Slots active={w.active} total={w.concurrency} />
              <span className="text-sm text-steel tabular-nums">{w.active} of {w.concurrency} threads busy</span>
            </div>
          </section>
        ))}
        {list.length === 0 && (
          <div className="panel px-6 py-12 text-center text-steel">
            No workers have checked in during the last hour. Start the backend with WORKER_ENABLED=true.
          </div>
        )}
      </div>
    </Layout>
  )
}
