// Minimal cron evaluator used by demo mode (the real backend uses Spring's CronExpression).
// Supports 5- or 6-field expressions with *, */n, a-b, a-b/n, and comma lists.

const RANGES = [
  [0, 59], // second
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 6], // day of week (0 = Sunday)
]

function parseField(expr, [min, max]) {
  const allowed = new Set()
  for (const part of expr.split(',')) {
    const [rangePart, stepPart] = part.split('/')
    const step = stepPart ? Number(stepPart) : 1
    let lo = min
    let hi = max
    if (rangePart !== '*' && rangePart !== '?') {
      const [a, b] = rangePart.split('-').map(Number)
      lo = a
      hi = b ?? (stepPart ? max : a)
    }
    if ([lo, hi, step].some((n) => Number.isNaN(n)) || step < 1 || lo < min || hi > max || lo > hi) {
      throw new Error(`Invalid cron field "${expr}"`)
    }
    for (let v = lo; v <= hi; v += step) allowed.add(v === 7 ? 0 : v)
  }
  return allowed
}

export function parseCron(expression) {
  const parts = expression.trim().split(/\s+/)
  const fields = parts.length === 5 ? ['0', ...parts] : parts
  if (fields.length !== 6) throw new Error('Use 5 or 6 cron fields')
  return fields.map((f, i) => parseField(f, RANGES[i]))
}

export function isValidCron(expression) {
  try {
    parseCron(expression)
    return true
  } catch {
    return false
  }
}

/** Next fire time strictly after `after` (Date). Searches up to ~400 days ahead. */
export function nextRun(expression, after = new Date()) {
  const [sec, min, hour, dom, mon, dow] = parseCron(expression)
  const t = new Date(after.getTime())
  t.setMilliseconds(0)
  t.setSeconds(t.getSeconds() + 1)
  const limit = after.getTime() + 400 * 86_400_000
  while (t.getTime() < limit) {
    if (!mon.has(t.getMonth() + 1)) {
      t.setMonth(t.getMonth() + 1, 1)
      t.setHours(0, 0, 0)
      continue
    }
    if (!dom.has(t.getDate()) || !dow.has(t.getDay())) {
      t.setDate(t.getDate() + 1)
      t.setHours(0, 0, 0)
      continue
    }
    if (!hour.has(t.getHours())) {
      t.setHours(t.getHours() + 1, 0, 0)
      continue
    }
    if (!min.has(t.getMinutes())) {
      t.setMinutes(t.getMinutes() + 1, 0)
      continue
    }
    if (!sec.has(t.getSeconds())) {
      t.setSeconds(t.getSeconds() + 1)
      continue
    }
    return t
  }
  throw new Error('Cron expression never fires')
}

export function previewCron(expression, count = 5) {
  const out = []
  let cursor = new Date()
  for (let i = 0; i < count; i++) {
    cursor = nextRun(expression, cursor)
    out.push(cursor.toISOString())
  }
  return out
}

/** Plain-English description of common patterns, for the schedule list. */
export function describeCron(expression) {
  const parts = expression.trim().split(/\s+/)
  const [s, m, h, dom, mon, dow] = parts.length === 5 ? ['0', ...parts] : parts
  const every = (f) => f === '*' || f === '?'
  if ([m, h, dom, mon, dow].every(every) && s.startsWith('*/')) return `Every ${s.slice(2)} seconds`
  if ([m, h, dom, mon, dow].every(every) && /^\d+$/.test(s)) return `Every minute at :${s.padStart(2, '0')}s`
  if (m.startsWith('*/') && [h, dom, mon, dow].every(every)) return `Every ${m.slice(2)} minutes`
  if (/^\d+$/.test(m) && every(h) && [dom, mon, dow].every(every)) return `Hourly at :${m.padStart(2, '0')}`
  if (/^\d+$/.test(m) && /^\d+$/.test(h) && [dom, mon, dow].every(every)) {
    return `Daily at ${h.padStart(2, '0')}:${m.padStart(2, '0')}`
  }
  if (/^\d+$/.test(m) && /^\d+$/.test(h) && every(dom) && every(mon) && /^[\d,-]+$/.test(dow)) {
    return dow === '1-5' ? `Weekdays at ${h.padStart(2, '0')}:${m.padStart(2, '0')}` : `Weekly at ${h.padStart(2, '0')}:${m.padStart(2, '0')}`
  }
  return 'Custom schedule'
}
