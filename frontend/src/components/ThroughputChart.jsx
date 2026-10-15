import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useThemeColors } from '../lib/theme'

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const ok = payload.find((p) => p.dataKey === 'succeeded')?.value ?? 0
  const bad = payload.find((p) => p.dataKey === 'failed')?.value ?? 0
  return (
    <div className="rounded border border-line bg-panel px-3 py-2 text-sm shadow-md">
      <div className="font-medium">{new Date(label).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
      <div className="text-patina">{ok} succeeded</div>
      <div className="text-oxblood">{bad} failed attempts</div>
    </div>
  )
}

export default function ThroughputChart({ points = [] }) {
  const c = useThemeColors()
  const css = (name, alpha = 1) => c[name](alpha)
  const total = points.reduce((s, p) => s + p.succeeded, 0)
  const failed = points.reduce((s, p) => s + p.failed, 0)
  return (
    <section className="panel p-4" aria-label="Throughput">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Throughput</h2>
        <p className="text-sm text-steel">
          {total.toLocaleString()} jobs completed and {failed.toLocaleString()} failed attempts in the last 30 minutes
        </p>
      </div>
      <div className="mt-3 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} barCategoryGap={2} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={css('line')} />
            <XAxis
              dataKey="minute"
              tickFormatter={(v) => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              interval={5}
              tick={{ fill: css('steel'), fontSize: 11.5 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis allowDecimals={false} tick={{ fill: css('steel'), fontSize: 11.5 }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: css('ink', 0.05) }} />
            <Bar dataKey="succeeded" stackId="a" fill={css('patina', 0.85)} isAnimationActive={false} />
            <Bar dataKey="failed" stackId="a" fill={css('oxblood', 0.85)} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
