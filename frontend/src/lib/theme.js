import { useEffect, useState } from 'react'

const NAMES = ['paper', 'panel', 'ink', 'steel', 'line', 'ash', 'molten', 'patina', 'oxblood', 'cobalt']

function read() {
  const style = getComputedStyle(document.documentElement)
  const out = {}
  for (const n of NAMES) {
    const triplet = style.getPropertyValue(`--${n}`).trim().replace(/\s+/g, ', ')
    out[n] = (alpha = 1) => `rgba(${triplet}, ${alpha})`
  }
  return out
}

/**
 * SVG presentation attributes (used by Recharts) can't resolve CSS variables,
 * so resolve the theme tokens in JS and re-resolve when the theme class changes.
 */
export function useThemeColors() {
  const [colors, setColors] = useState(read)
  useEffect(() => {
    const observer = new MutationObserver(() => setColors(read()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return colors
}

export function isDark() {
  return document.documentElement.classList.contains('dark')
}

export function setTheme(dark) {
  document.documentElement.classList.toggle('dark', dark)
  try { localStorage.setItem('qf-theme', dark ? 'dark' : 'light') } catch { /* storage unavailable */ }
}
