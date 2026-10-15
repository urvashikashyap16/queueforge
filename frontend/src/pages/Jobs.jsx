import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import Layout from '../components/Layout'
import StatusBadge from '../components/StatusBadge'
import { useOpenJob } from '../components/JobDrawer'
import { useNow, usePolling } from '../lib/context'
import { compact, ms, relative, shortId } from '../lib/format'

const STATUSES = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Waiting' },
  { value: 'RUNNING', label: 'Running' },
  { value: 'SUCCEEDED', label: 'Succeeded' },
  { value: 'DEAD', label: 'Dead' },
  { value: 'CANCELLED', label: 'Cancelled' },
]
const PAGE_SIZE = 25

function timing(job, now) {
  if (job.status === 'PENDING') return { text: relative(job.runAt, now), title: 'Next run' }
  if (job.status === 'RUNNING') return { text: `running ${relative(job.startedAt, now).replace(' ago', '')}`, title: 'Started' }
  if (job.finishedAt && job.startedAt) {
    return { text: ms(new Date(job.finishedAt) - new Date(job.startedAt)), title: 'Last attempt duration' }
  }
  return { text: '—', title: '' }
}

export default function Jobs() {
  const [params, setParams] = useSearchParams()
  const openJob = useOpenJob()
  const now = useNow()
  const status = params.get('status') ?? ''
  const queue = params.get('queue') ?? ''
  const type = params.get('type') ?? ''
  const page = Number(params.get('page') ?? 0)
  const [search, setSearch] = useState(params.get('q') ?? '')

  const setParam = (key, value) => {
    const next = new URLSearchParams(params)
    if (value === '' || value == null) next.delete(key)
    else next.set(key, value)
    if (key !== 'page') next.delete('page')
    setParams(next)
  }

  // Debounce the search box into the URL
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get('q') ?? '') !== search) setParam('q', search)
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const q = params.get('q') ?? ''
  const { data, loading } = usePolling(
    (api) => api.jobs({ status, queue, type, q, page, size: PAGE_SIZE }),
    { interval: 2500, deps: [status, queue, type, q, page] },
  )
  const { data: stats } = usePolling((api) => api.stats(), { interval: 4000, refreshOnEvents: false })
  const { data: types } = usePolling((api) => api.jobTypes(), { interval: 60_000, refreshOnEvents: false })

  const counts = stats?.statusCounts ?? {}
  const totalAll = Object.values(counts).reduce((s, n) => s + n, 0)
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <Layout title="Jobs" description="Search every job. Select one to see its payload and full attempt history.">
      <div className="panel">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-3">
          <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-1">
            {STATUSES.map((s) => {
              const n = s.value ? counts[s.value] : totalAll
              const active = status === s.value
              return (
                <button
                  key={s.value || 'all'}
                  role="tab"
                  aria-selected={active}
                  type="button"
                  onClick={() => setParam('status', s.value)}
                  className={`rounded px-2.5 py-1 text-sm font-medium ${active ? 'bg-ink text-paper' : 'text-steel hover:bg-sunk hover:text-ink'}`}
                >
                  {s.label}
                  {n != null && <span className={`ml-1.5 tabular-nums ${active ? 'text-paper/70' : 'text-ash'}`}>{compact(n)}</span>}
                </button>
              )
            })}
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <select className="field w-auto" value={queue} onChange={(e) => setParam('queue', e.target.value)} aria-label="Queue">
              <option value="">All queues</option>
              {(stats?.queues ?? []).map((qq) => <option key={qq.name} value={qq.name}>{qq.name}</option>)}
            </select>
            <select className="field w-auto" value={type} onChange={(e) => setParam('type', e.target.value)} aria-label="Job type">
              <option value="">All types</option>
              {(types ?? []).map((t) => <option key={t.type} value={t.type}>{t.type}</option>)}
            </select>
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ash" aria-hidden="true" />
              <input
                className="field w-56 pl-8"
                placeholder="Job ID, key or error text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search jobs"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="th">Job</th>
                <th className="th">Queue</th>
                <th className="th">Status</th>
                <th className="th text-right">Attempts</th>
                <th className="th text-right">Priority</th>
                <th className="th">Created</th>
                <th className="th">Timing</th>
              </tr>
            </thead>
            <tbody>
              {items.map((job) => {
                const t = timing(job, now)
                return (
                  <tr
                    key={job.id}
                    onClick={() => openJob(job.id)}
                    className="cursor-pointer border-b border-line last:border-b-0 hover:bg-sunk/60"
                  >
                    <td className="td">
                      <button type="button" className="text-left" onClick={(e) => { e.stopPropagation(); openJob(job.id) }}>
                        <div className="font-medium">{job.type}</div>
                        <div className="font-mono text-xs text-steel">{shortId(job.id)}</div>
                      </button>
                    </td>
                    <td className="td text-steel">{job.queue}</td>
                    <td className="td">
                      <StatusBadge job={job} />
                      {job.lastError && job.status !== 'SUCCEEDED' && (
                        <div className="max-w-[260px] truncate text-xs text-steel" title={job.lastError}>{job.lastError}</div>
                      )}
                    </td>
                    <td className="td text-right tabular-nums">{job.attempts}/{job.maxAttempts}</td>
                    <td className={`td text-right tabular-nums ${job.priority > 0 ? 'font-semibold' : 'text-steel'}`}>{job.priority}</td>
                    <td className="td whitespace-nowrap text-steel">{relative(job.createdAt, now)}</td>
                    <td className="td whitespace-nowrap text-steel" title={t.title}>{t.text}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!loading && items.length === 0 && (
            <p className="px-4 py-10 text-center text-steel">
              No jobs match these filters. Clear a filter or enqueue a job to see it here.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-line px-3 py-2.5 text-sm text-steel">
          <span className="tabular-nums">
            {total === 0 ? 'No results' : `${(page * PAGE_SIZE + 1).toLocaleString()}–${Math.min(total, (page + 1) * PAGE_SIZE).toLocaleString()} of ${total.toLocaleString()}`}
          </span>
          <div className="flex gap-1">
            <button type="button" className="btn-quiet px-2 py-1" disabled={page === 0} onClick={() => setParam('page', page - 1)} aria-label="Previous page">
              <ChevronLeft size={15} />
            </button>
            <button type="button" className="btn-quiet px-2 py-1" disabled={page + 1 >= pages} onClick={() => setParam('page', page + 1)} aria-label="Next page">
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>
    </Layout>
  )
}
