const META = {
  PENDING: { label: 'Waiting', dot: 'bg-cobalt', text: 'text-cobalt' },
  RETRYING: { label: 'Retry scheduled', dot: 'bg-cobalt', text: 'text-cobalt' },
  DELAYED: { label: 'Delayed', dot: 'bg-ash', text: 'text-steel' },
  RUNNING: { label: 'Running', dot: 'bg-molten', text: 'text-molten' },
  SUCCEEDED: { label: 'Succeeded', dot: 'bg-patina', text: 'text-patina' },
  DEAD: { label: 'Dead', dot: 'bg-oxblood', text: 'text-oxblood' },
  CANCELLED: { label: 'Cancelled', dot: 'bg-ash', text: 'text-steel' },
}

/** Pending jobs are split into "waiting", "delayed" and "retry scheduled" because they mean different things to an operator. */
export function displayStatus(job, now = Date.now()) {
  if (job.status !== 'PENDING') return job.status
  if (job.attempts > 0) return 'RETRYING'
  if (new Date(job.runAt).getTime() > now + 1000) return 'DELAYED'
  return 'PENDING'
}

export default function StatusBadge({ job, status }) {
  const key = status ?? displayStatus(job)
  const m = META[key] ?? META.PENDING
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium ${m.text}`}>
      <span className={`h-2 w-2 rounded-full ${m.dot} ${key === 'RUNNING' ? 'animate-pulse' : ''}`} aria-hidden="true" />
      {m.label}
    </span>
  )
}

export const STATUS_META = META
