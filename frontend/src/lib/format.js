export function shortId(id) {
  return id ? id.slice(0, 8) : '—'
}

export function relative(iso, now = Date.now()) {
  if (!iso) return '—'
  const diff = new Date(iso).getTime() - now
  const abs = Math.abs(diff)
  const s = Math.round(abs / 1000)
  let text
  if (s < 5) return diff > 0 ? 'in a moment' : 'just now'
  if (s < 60) text = `${s}s`
  else if (s < 3600) text = `${Math.round(s / 60)}m`
  else if (s < 86400) text = `${Math.round(s / 3600)}h`
  else text = `${Math.round(s / 86400)}d`
  return diff > 0 ? `in ${text}` : `${text} ago`
}

export function clock(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function dateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString([], {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export function ms(value) {
  if (value == null) return '—'
  if (value < 1000) return `${Math.round(value)} ms`
  if (value < 60_000) return `${(value / 1000).toFixed(value < 10_000 ? 2 : 1)} s`
  return `${Math.floor(value / 60_000)}m ${Math.round((value % 60_000) / 1000)}s`
}

export function seconds(value) {
  if (value == null) return '—'
  return ms(value * 1000)
}

export function compact(n) {
  if (n == null) return '—'
  if (n < 1000) return String(n)
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

export function pct(x) {
  if (x == null) return '—'
  return `${(x * 100).toFixed(x >= 0.999 || x === 0 ? 0 : 1)}%`
}

export function prettyJson(value) {
  try {
    return JSON.stringify(typeof value === 'string' ? JSON.parse(value) : value, null, 2)
  } catch {
    return String(value)
  }
}
