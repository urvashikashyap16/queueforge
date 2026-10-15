import { useEffect, useState } from 'react'
import { Pencil, Play, Plus, Trash2 } from 'lucide-react'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import { useApi, useNow, usePolling } from '../lib/context'
import { describeCron } from '../lib/cron'
import { dateTime, prettyJson, relative } from '../lib/format'
import { useToast } from '../lib/toast'

const EMPTY = { name: '', cron: '0 */5 * * * *', queue: 'default', type: '', payload: '{}', priority: 0, maxAttempts: 5, enabled: true }
const PRESETS = [
  ['Every 30 seconds', '*/30 * * * * *'],
  ['Every 5 minutes', '0 */5 * * * *'],
  ['Hourly', '0 0 * * * *'],
  ['Daily at 02:00', '0 0 2 * * *'],
  ['Weekdays at 09:00', '0 0 9 * * 1-5'],
]

function ScheduleForm({ initial, onDone }) {
  const { api } = useApi()
  const toast = useToast()
  const [form, setForm] = useState(initial)
  const [types, setTypes] = useState([])
  const [preview, setPreview] = useState({ times: [], error: null })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const editing = Boolean(initial.id)

  useEffect(() => {
    api.jobTypes().then((t) => {
      setTypes(t)
      if (!initial.type && t.length) {
        setForm((f) => ({ ...f, type: t[0].type, payload: prettyJson(t[0].examplePayload) }))
      }
    })
  }, [api, initial.type])

  // Live preview of the next fire times as the expression is typed
  useEffect(() => {
    const t = setTimeout(() => {
      api.previewCron(form.cron)
        .then((times) => setPreview({ times, error: null }))
        .catch((e) => setPreview({ times: [], error: e.message }))
    }, 250)
    return () => clearTimeout(t)
  }, [api, form.cron])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function save(e) {
    e.preventDefault()
    setError(null)
    let payload
    try { payload = JSON.parse(form.payload || '{}') } catch { setError('Payload must be valid JSON'); return }
    const body = {
      name: form.name.trim(), cron: form.cron.trim(), queue: form.queue.trim() || 'default', type: form.type,
      payload, priority: Number(form.priority), maxAttempts: Number(form.maxAttempts), enabled: form.enabled,
    }
    setSaving(true)
    try {
      if (editing) await api.updateSchedule(initial.id, body)
      else await api.createSchedule(body)
      toast(editing ? 'Schedule saved' : 'Schedule created', 'success')
      onDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="s-name">Name</label>
          <input id="s-name" className="field" required value={form.name} onChange={set('name')} disabled={editing} placeholder="nightly-sales-report" />
        </div>
        <div>
          <label className="label" htmlFor="s-type">Job type</label>
          <select id="s-type" className="field" value={form.type} onChange={set('type')}>
            {types.map((t) => <option key={t.type} value={t.type}>{t.type}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="s-cron">Cron expression</label>
        <input id="s-cron" className="field font-mono" value={form.cron} onChange={set('cron')} spellCheck={false} />
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {PRESETS.map(([label, cron]) => (
            <button key={cron} type="button" onClick={() => setForm((f) => ({ ...f, cron }))}
              className={`rounded-sm border px-2 py-0.5 text-xs ${form.cron === cron ? 'border-ink text-ink' : 'border-line text-steel hover:text-ink'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="mt-2 rounded bg-sunk px-3 py-2 text-xs">
          {preview.error ? (
            <span className="text-oxblood">{preview.error}</span>
          ) : (
            <>
              <span className="font-medium">Next runs:</span>{' '}
              <span className="text-steel">{preview.times.map((t) => dateTime(t)).join(', ')}</span>
            </>
          )}
        </div>
        <p className="mt-1 text-xs text-steel">Six fields with seconds first (sec min hour day month weekday). Five-field cron also works.</p>
      </div>

      <div>
        <label className="label" htmlFor="s-payload">Payload (JSON)</label>
        <textarea id="s-payload" rows={4} className="field font-mono text-xs" value={form.payload} onChange={set('payload')} spellCheck={false} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="s-queue">Queue</label>
          <input id="s-queue" className="field" value={form.queue} onChange={set('queue')} />
        </div>
        <div>
          <label className="label" htmlFor="s-priority">Priority</label>
          <input id="s-priority" type="number" min={-10} max={10} className="field" value={form.priority} onChange={set('priority')} />
        </div>
        <div>
          <label className="label" htmlFor="s-attempts">Max attempts</label>
          <input id="s-attempts" type="number" min={1} max={25} className="field" value={form.maxAttempts} onChange={set('maxAttempts')} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.enabled} onChange={set('enabled')} className="h-4 w-4 accent-[rgb(var(--ink))]" />
        Enabled
      </label>

      {error && <p className="text-sm text-oxblood" role="alert">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-quiet" onClick={() => onDone(false)}>Close</button>
        <button type="submit" className="btn-primary" disabled={saving || Boolean(preview.error)}>
          {saving ? 'Saving…' : editing ? 'Save schedule' : 'Create schedule'}
        </button>
      </div>
    </form>
  )
}

export default function Schedules() {
  const { api } = useApi()
  const toast = useToast()
  const now = useNow()
  const [editing, setEditing] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const { data: schedules, reload } = usePolling((a) => a.schedules(), { interval: 3000 })

  async function act(fn, msg) {
    try {
      await fn()
      toast(msg, 'success')
      reload()
    } catch (e) {
      toast(e.message, 'error')
    }
  }

  return (
    <Layout
      title="Schedules"
      description="Recurring jobs. Each tick is enqueued exactly once, even with several app instances running."
      actions={(
        <button type="button" className="btn-quiet" onClick={() => setEditing(EMPTY)}>
          <Plus size={14} /> New schedule
        </button>
      )}
    >
      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="th">Schedule</th>
              <th className="th">When</th>
              <th className="th">Job</th>
              <th className="th">Next run</th>
              <th className="th">Last run</th>
              <th className="th">Enabled</th>
              <th className="th"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {(schedules ?? []).map((s) => (
              <tr key={s.id} className={`border-b border-line last:border-b-0 ${s.enabled ? '' : 'text-steel'}`}>
                <td className="td font-medium">{s.name}</td>
                <td className="td">
                  <div>{describeCron(s.cron)}</div>
                  <div className="font-mono text-xs text-steel">{s.cron}</div>
                </td>
                <td className="td">
                  <div>{s.type}</div>
                  <div className="text-xs text-steel">on {s.queue}</div>
                </td>
                <td className="td whitespace-nowrap tabular-nums">{s.enabled ? relative(s.nextRunAt, now) : 'Paused'}</td>
                <td className="td whitespace-nowrap text-steel">{relative(s.lastRunAt, now)}</td>
                <td className="td">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={s.enabled}
                    aria-label={`${s.enabled ? 'Disable' : 'Enable'} ${s.name}`}
                    onClick={() => act(() => api.setScheduleEnabled(s.id, !s.enabled), s.enabled ? `Paused ${s.name}` : `Enabled ${s.name}`)}
                    className={`relative h-5 w-9 rounded-full transition-colors ${s.enabled ? 'bg-patina' : 'bg-line'}`}
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-panel shadow transition-all ${s.enabled ? 'left-[18px]' : 'left-0.5'}`} />
                  </button>
                </td>
                <td className="td">
                  <div className="flex justify-end gap-1">
                    <button type="button" className="btn-quiet px-2 py-1" onClick={() => act(() => api.triggerSchedule(s.id), `Queued a run of ${s.name}`)}>
                      <Play size={13} /> Run now
                    </button>
                    <button type="button" className="rounded p-1.5 text-steel hover:bg-sunk hover:text-ink" aria-label={`Edit ${s.name}`}
                      onClick={() => setEditing({ ...s, payload: prettyJson(s.payload) })}>
                      <Pencil size={15} />
                    </button>
                    {confirmDelete === s.id ? (
                      <button type="button" className="btn-danger px-2 py-1" autoFocus
                        onBlur={() => setConfirmDelete(null)}
                        onClick={() => { setConfirmDelete(null); act(() => api.deleteSchedule(s.id), `Deleted ${s.name}`) }}>
                        Delete schedule
                      </button>
                    ) : (
                      <button type="button" className="rounded p-1.5 text-steel hover:bg-sunk hover:text-oxblood" aria-label={`Delete ${s.name}`}
                        title="Delete (jobs it already created are kept)"
                        onClick={() => setConfirmDelete(s.id)}>
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {schedules && schedules.length === 0 && (
          <p className="px-4 py-10 text-center text-steel">No schedules yet. Create one to run a job on a cron timetable.</p>
        )}
      </div>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? `Edit ${editing.name}` : 'New schedule'} width="max-w-2xl">
        {editing && <ScheduleForm initial={editing} onDone={(changed) => { setEditing(null); if (changed) reload() }} />}
      </Modal>
    </Layout>
  )
}
