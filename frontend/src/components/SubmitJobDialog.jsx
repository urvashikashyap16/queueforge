import { useEffect, useState } from 'react'
import { useApi } from '../lib/context'
import { prettyJson } from '../lib/format'
import { useToast } from '../lib/toast'
import Modal from './Modal'
import { useOpenJob } from './JobDrawer'

const SUGGESTED_QUEUE = {
  'email.send': 'emails',
  'webhook.deliver': 'webhooks',
  'report.generate': 'reports',
  'payment.reconcile': 'payments',
}

export default function SubmitJobDialog({ open, onClose }) {
  const { api } = useApi()
  const toast = useToast()
  const openJob = useOpenJob()
  const [types, setTypes] = useState([])
  const [form, setForm] = useState({ type: '', queue: 'default', payload: '{}', priority: 0, maxAttempts: 5, delaySeconds: 0, idempotencyKey: '' })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !api) return
    api.jobTypes().then((t) => {
      setTypes(t)
      if (!form.type && t.length) pickType(t[0].type, t)
    }).catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, api])

  function pickType(type, list = types) {
    const info = list.find((t) => t.type === type)
    setForm((f) => ({
      ...f,
      type,
      queue: SUGGESTED_QUEUE[type] ?? 'default',
      payload: prettyJson(info?.examplePayload ?? {}),
    }))
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setError(null)
    let payload
    try {
      payload = JSON.parse(form.payload || '{}')
    } catch {
      setError('Payload must be valid JSON')
      return
    }
    setSaving(true)
    try {
      const { job, created } = await api.submit({
        type: form.type,
        queue: form.queue.trim() || 'default',
        payload,
        priority: Number(form.priority),
        maxAttempts: Number(form.maxAttempts),
        delaySeconds: Number(form.delaySeconds),
      }, form.idempotencyKey.trim() || undefined)
      toast(created ? 'Job queued' : 'A job with that idempotency key already exists — showing it instead', created ? 'success' : 'info')
      onClose()
      openJob(job.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const info = types.find((t) => t.type === form.type)

  return (
    <Modal open={open} onClose={onClose} title="Enqueue a job">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="job-type">Job type</label>
            <select id="job-type" className="field" value={form.type} onChange={(e) => pickType(e.target.value)}>
              {types.map((t) => <option key={t.type} value={t.type}>{t.type}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="job-queue">Queue</label>
            <input id="job-queue" className="field" value={form.queue} onChange={set('queue')} pattern="[a-z0-9._\-]*" />
          </div>
        </div>
        {info?.description && <p className="-mt-2 text-sm text-steel">{info.description}</p>}

        <div>
          <label className="label" htmlFor="job-payload">Payload (JSON)</label>
          <textarea id="job-payload" rows={5} className="field font-mono text-xs leading-relaxed" value={form.payload} onChange={set('payload')} spellCheck={false} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="job-priority">Priority <span className="font-normal text-ash">(−10 to 10)</span></label>
            <input id="job-priority" type="number" min={-10} max={10} className="field" value={form.priority} onChange={set('priority')} />
          </div>
          <div>
            <label className="label" htmlFor="job-attempts">Max attempts</label>
            <input id="job-attempts" type="number" min={1} max={25} className="field" value={form.maxAttempts} onChange={set('maxAttempts')} />
          </div>
          <div>
            <label className="label" htmlFor="job-delay">Delay (seconds)</label>
            <input id="job-delay" type="number" min={0} className="field" value={form.delaySeconds} onChange={set('delaySeconds')} />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="job-key">Idempotency key <span className="font-normal text-ash">(optional)</span></label>
          <input id="job-key" className="field" placeholder="e.g. order-1042-confirmation" value={form.idempotencyKey} onChange={set('idempotencyKey')} />
          <p className="mt-1 text-xs text-steel">Submitting twice with the same key returns the original job instead of creating a duplicate.</p>
        </div>

        {error && <p className="text-sm text-oxblood" role="alert">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-quiet" onClick={onClose}>Close</button>
          <button type="submit" className="btn-primary" disabled={saving || !form.type}>{saving ? 'Queuing…' : 'Enqueue job'}</button>
        </div>
      </form>
    </Modal>
  )
}
