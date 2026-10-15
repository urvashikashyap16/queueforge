import { Link } from 'react-router-dom'
import { compact, ms, pct } from '../lib/format'

export default function TypeTable({ rows = [] }) {
  return (
    <section className="panel" aria-label="Job types">
      <div className="flex items-baseline justify-between px-4 pt-3.5">
        <h2 className="text-lg font-semibold">Job types</h2>
        <p className="text-sm text-steel">Jobs created in the last 24 hours</p>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="th">Type</th>
              <th className="th text-right">Jobs</th>
              <th className="th text-right">Succeeded</th>
              <th className="th text-right">Dead</th>
              <th className="th text-right">Avg run time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.type} className="border-b border-line last:border-b-0">
                <td className="td"><Link to={`/jobs?type=${r.type}`} className="font-medium hover:underline">{r.type}</Link></td>
                <td className="td text-right tabular-nums">{compact(r.total)}</td>
                <td className="td text-right tabular-nums text-patina">{r.total ? pct(r.succeeded / r.total) : '—'}</td>
                <td className={`td text-right tabular-nums ${r.dead ? 'text-oxblood' : 'text-steel'}`}>{compact(r.dead)}</td>
                <td className="td text-right tabular-nums">{ms(r.avgMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
