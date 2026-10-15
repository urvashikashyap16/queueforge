import { ms, pct, seconds } from '../lib/format'

function Row({ label, value, hint, tone = '' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-steel">{hint}</div>}
      </div>
      <div className={`text-xl font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  )
}

/** The handful of numbers an on-call engineer checks first. */
export default function HealthPanel({ stats }) {
  const rate = stats?.successRate15m
  const lag = stats?.oldestPendingSeconds
  return (
    <section className="panel px-4 py-3" aria-label="Health">
      <h2 className="text-lg font-semibold">Health</h2>
      <div className="mt-1">
        <Row
          label="Attempt success rate"
          hint="Last 15 minutes, including retries"
          value={pct(rate)}
          tone={rate == null ? '' : rate < 0.8 ? 'text-oxblood' : rate < 0.9 ? 'text-molten' : 'text-patina'}
        />
        <Row label="Median run time" hint="p50 of successful attempts" value={ms(stats?.p50Ms)} />
        <Row label="Slowest 5%" hint={`p95 of successful attempts; p99 is ${ms(stats?.p99Ms)}`} value={ms(stats?.p95Ms)} />
        <Row
          label="Queue lag"
          hint="How long the oldest ready job has waited"
          value={lag == null ? 'None' : seconds(lag)}
          tone={lag != null && lag > 30 ? 'text-molten' : ''}
        />
      </div>
    </section>
  )
}
