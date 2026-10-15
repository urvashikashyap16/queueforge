import { Pause, Play } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import { useApi } from '../lib/context'
import { compact, seconds } from '../lib/format'
import { useToast } from '../lib/toast'

/** Queue depth with a stacked bar so the busiest queue is obvious at a glance. */
export default function QueueTable({ queues = [], onChange }) {
  const { api } = useApi()
  const toast = useToast()
  const [busy, setBusy] = useState(null)
  const max = Math.max(1, ...queues.map((q) => q.pending + q.running))

  async function toggle(q) {
    setBusy(q.name)
    try {
      await (q.paused ? api.resumeQueue(q.name) : api.pauseQueue(q.name))
      toast(q.paused ? `Resumed ${q.name}` : `Paused ${q.name} — workers will skip it`, 'success')
      onChange?.()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="panel" aria-label="Queues">
      <div className="flex items-baseline justify-between px-4 pt-3.5">
        <h2 className="text-lg font-semibold">Queues</h2>
        <p className="text-sm text-steel">Pause a queue to stop workers claiming from it</p>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="th">Queue</th>
              <th className="th w-[34%]">Depth</th>
              <th className="th text-right">Waiting</th>
              <th className="th text-right">Running</th>
              <th className="th text-right">Dead</th>
              <th className="th text-right">Lag</th>
              <th className="th"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {queues.map((q) => (
              <tr key={q.name} className="border-b border-line last:border-b-0">
                <td className="td">
                  <Link to={`/jobs?queue=${q.name}`} className="font-medium hover:underline">{q.name}</Link>
                  {q.paused && <span className="ml-2 rounded-sm bg-sunk px-1.5 py-0.5 text-xs font-medium text-steel">Paused</span>}
                </td>
                <td className="td">
                  <div className="flex h-2 overflow-hidden rounded-sm bg-sunk" aria-hidden="true">
                    <div className="bg-molten" style={{ width: `${(q.running / max) * 100}%` }} />
                    <div className={q.paused ? 'bg-ash' : 'bg-cobalt'} style={{ width: `${(q.pending / max) * 100}%` }} />
                  </div>
                </td>
                <td className="td text-right tabular-nums">{compact(q.pending)}</td>
                <td className="td text-right tabular-nums">{compact(q.running)}</td>
                <td className={`td text-right tabular-nums ${q.dead ? 'text-oxblood' : 'text-steel'}`}>{compact(q.dead)}</td>
                <td className={`td text-right tabular-nums ${q.oldestPendingSeconds > 30 ? 'text-molten' : 'text-steel'}`}>
                  {q.oldestPendingSeconds == null ? '—' : seconds(q.oldestPendingSeconds)}
                </td>
                <td className="td text-right">
                  <button
                    type="button"
                    className="btn-quiet px-2 py-1"
                    onClick={() => toggle(q)}
                    disabled={busy === q.name}
                    aria-label={q.paused ? `Resume ${q.name}` : `Pause ${q.name}`}
                  >
                    {q.paused ? <Play size={14} /> : <Pause size={14} />}
                    {q.paused ? 'Resume' : 'Pause'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
