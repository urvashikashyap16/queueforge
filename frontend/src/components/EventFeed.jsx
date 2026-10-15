import { useApi } from '../lib/context'
import { clock, shortId } from '../lib/format'
import { useOpenJob } from './JobDrawer'

const KIND = {
  ENQUEUED: { label: 'Enqueued', dot: 'bg-cobalt' },
  REQUEUED: { label: 'Re-queued', dot: 'bg-cobalt' },
  STARTED: { label: 'Started', dot: 'bg-molten' },
  SUCCEEDED: { label: 'Succeeded', dot: 'bg-patina' },
  RETRY_SCHEDULED: { label: 'Will retry', dot: 'bg-molten' },
  LEASE_EXPIRED: { label: 'Lease expired', dot: 'bg-ash' },
  DEAD: { label: 'Dead', dot: 'bg-oxblood' },
  CANCELLED: { label: 'Cancelled', dot: 'bg-ash' },
}

/** Streamed over Server-Sent Events from the backend. */
export default function EventFeed({ limit = 40, hideNoise = true }) {
  const { events, connection } = useApi()
  const openJob = useOpenJob()
  // ENQUEUED/STARTED are the bulk of traffic; outcomes are what people want to read
  const shown = (hideNoise ? events.filter((e) => e.kind !== 'STARTED' && e.kind !== 'ENQUEUED') : events).slice(0, limit)

  return (
    <section className="panel flex min-h-0 flex-col" aria-label="Live events">
      <div className="flex items-center justify-between px-4 pt-3.5">
        <h2 className="text-lg font-semibold">Live events</h2>
        <span className="flex items-center gap-1.5 text-sm text-steel">
          <span className={`h-2 w-2 rounded-full ${connection === 'connected' ? 'bg-patina' : 'bg-molten animate-pulse'}`} aria-hidden="true" />
          {connection === 'connected' ? 'Streaming' : 'Reconnecting'}
        </span>
      </div>
      <ol className="mt-2 max-h-[420px] min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {shown.length === 0 && (
          <li className="px-2 py-6 text-sm text-steel">Outcomes appear here as workers finish jobs.</li>
        )}
        {shown.map((e, i) => {
          const k = KIND[e.kind] ?? KIND.ENQUEUED
          return (
            <li key={`${e.jobId}-${e.kind}-${e.at}-${i}`}>
              <button
                type="button"
                onClick={() => openJob(e.jobId)}
                className={`w-full rounded px-2 py-1.5 text-left hover:bg-sunk ${i === 0 ? 'qf-new' : ''}`}
              >
                <div className="flex items-center gap-2 text-sm">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${k.dot}`} aria-hidden="true" />
                  <span className="font-medium">{k.label}</span>
                  <span className="text-steel">{e.type}</span>
                  <span className="ml-auto font-mono text-xs text-ash">{clock(e.at)}</span>
                </div>
                {e.message && (
                  <div className="ml-4 truncate text-xs text-steel">
                    <span className="font-mono">{shortId(e.jobId)}</span> {e.message}
                  </div>
                )}
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
