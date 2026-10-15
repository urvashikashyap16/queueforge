import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '../lib/context'
import { compact } from '../lib/format'

// Station centres along the rail (percent of width): waiting, running, succeeded, dead letter
const X = { in: 0, waiting: 12.5, running: 37.5, done: 62.5, dead: 87.5 }

// Which way a spark travels for each lifecycle event, and on which lane
const ROUTES = {
  ENQUEUED: { from: X.in, to: X.waiting, lane: 1, color: 'bg-cobalt' },
  REQUEUED: { from: X.dead, to: X.waiting, lane: 0, color: 'bg-cobalt' },
  STARTED: { from: X.waiting, to: X.running, lane: 1, color: 'bg-molten' },
  SUCCEEDED: { from: X.running, to: X.done, lane: 1, color: 'bg-patina' },
  RETRY_SCHEDULED: { from: X.running, to: X.waiting, lane: 0, color: 'bg-molten' },
  LEASE_EXPIRED: { from: X.running, to: X.waiting, lane: 0, color: 'bg-ash' },
  DEAD: { from: X.running, to: X.dead, lane: 2, color: 'bg-oxblood' },
}
const LANE_Y = [6, 16, 26]
const MAX_SPARKS = 48

function Spark({ spark }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !el.animate) return
    el.animate(
      [{ left: `${spark.from}%`, opacity: 1 }, { left: `${spark.to}%`, opacity: 0.25 }],
      { duration: 1000, easing: 'cubic-bezier(.25,.7,.3,1)', fill: 'forwards' },
    )
  }, [spark])
  return (
    <span
      ref={ref}
      className={`qf-spark absolute h-1.5 w-1.5 -translate-x-1/2 rounded-full ${spark.color}`}
      style={{ left: `${spark.from}%`, top: LANE_Y[spark.lane] - 3 }}
      aria-hidden="true"
    />
  )
}

function Station({ label, value, detail, tone, hot, to }) {
  const body = (
    <div className={`h-full rounded-lg border bg-panel px-4 py-3.5 transition-colors ${hot ? 'qf-hot border-molten/50' : 'border-line'} ${to ? 'hover:border-steel/60' : ''}`}>
      <div className="flex items-center gap-2 text-sm font-medium text-steel">
        <span className={`h-2 w-2 rounded-full ${tone}`} aria-hidden="true" />
        {label}
      </div>
      <div className="mt-1 text-4xl font-semibold tracking-tight">{compact(value)}</div>
      <div className="mt-0.5 text-sm text-steel">{detail}</div>
    </div>
  )
  return to ? <Link to={to} className="block h-full focus-visible:rounded-lg">{body}</Link> : body
}

/**
 * The live pipeline: every job event streamed from the server becomes a spark
 * travelling between stations, so you can watch work move through the system.
 */
export default function ForgeLine({ stats }) {
  const { onEvent } = useApi()
  const [sparks, setSparks] = useState([])

  useEffect(() => onEvent((e) => {
    const route = ROUTES[e.kind]
    if (!route) return
    const id = `${e.jobId}-${e.kind}-${Math.random()}`
    setSparks((s) => [...s.slice(-(MAX_SPARKS - 1)), { id, ...route }])
    setTimeout(() => setSparks((s) => s.filter((x) => x.id !== id)), 1100)
  }), [onEvent])

  const c = stats?.statusCounts ?? {}
  const workers = stats?.workers?.filter((w) => w.alive) ?? []
  const slots = workers.reduce((s, w) => s + w.concurrency, 0)
  const lag = stats?.oldestPendingSeconds

  return (
    <section aria-label="Live job pipeline" className="panel p-4">
      {/* The rail spans the same width as the station grid, so ticks sit over each station's centre */}
      <div className="relative h-8" aria-hidden="true">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
        {[X.waiting, X.running, X.done, X.dead].map((x) => (
          <span key={x} className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-steel/50" style={{ left: `${x}%` }} />
        ))}
        {sparks.map((s) => <Spark key={s.id} spark={s} />)}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Station
          label="Waiting"
          value={c.PENDING ?? 0}
          tone="bg-cobalt"
          detail={lag != null && lag > 1 ? `Oldest ready job has waited ${Math.round(lag)}s` : 'Every ready job has been picked up'}
        />
        <Station
          label="Running"
          value={c.RUNNING ?? 0}
          tone="bg-molten"
          hot={(c.RUNNING ?? 0) > 0}
          detail={slots ? `${c.RUNNING ?? 0} of ${slots} worker slots busy` : 'No live workers'}
        />
        <Station
          label="Succeeded"
          value={c.SUCCEEDED ?? 0}
          tone="bg-patina"
          detail={`${compact(stats?.completedLastMinute ?? 0)} in the last minute`}
        />
        <Station
          label="Dead letter"
          value={c.DEAD ?? 0}
          tone="bg-oxblood"
          to="/dead-letter"
          detail={(c.DEAD ?? 0) > 0 ? 'Needs attention — open to retry' : 'Nothing has failed permanently'}
        />
      </div>
    </section>
  )
}
