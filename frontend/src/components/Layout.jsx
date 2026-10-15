import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { CalendarClock, Gauge, Moon, OctagonX, Plus, Rows3, Server, Sun, Zap } from 'lucide-react'
import { useApi } from '../lib/context'
import { isDark, setTheme } from '../lib/theme'
import { useToast } from '../lib/toast'
import SubmitJobDialog from './SubmitJobDialog'

const NAV = [
  { to: '/', label: 'Overview', icon: Gauge, end: true },
  { to: '/jobs', label: 'Jobs', icon: Rows3 },
  { to: '/dead-letter', label: 'Dead letter', icon: OctagonX },
  { to: '/schedules', label: 'Schedules', icon: CalendarClock },
  { to: '/workers', label: 'Workers', icon: Server },
]

function Mark() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" className="fill-ink" />
      <path d="M8 21h16M10 16h12M12 11h8" strokeWidth="3" strokeLinecap="round" className="stroke-molten" />
    </svg>
  )
}

export default function Layout({ title, description, actions, children }) {
  const { api } = useApi()
  const toast = useToast()
  const [submitOpen, setSubmitOpen] = useState(false)
  const [dark, setDark] = useState(isDark)
  const [bursting, setBursting] = useState(false)

  async function burst() {
    setBursting(true)
    try {
      const r = await api.burst(200)
      toast(`Sent ${r.enqueued} test jobs — watch them move through the pipeline`, 'success')
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setBursting(false)
    }
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[216px_1fr]">
      <aside className="border-b border-line bg-panel lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2.5 px-4 py-3.5 lg:py-5">
          <Mark />
          <span className="text-lg font-semibold tracking-tight">QueueForge</span>
        </div>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:pb-0">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-2.5 rounded px-2.5 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-sunk text-ink' : 'text-steel hover:bg-sunk/60 hover:text-ink'
                }`
              }
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden px-4 pb-4 lg:mt-auto lg:block">
          {api?.mode === 'demo' && (
            <p className="mb-3 rounded border border-molten/40 bg-molten/5 px-2.5 py-2 text-xs leading-relaxed text-steel">
              <span className="font-medium text-ink">Demo mode.</span> No backend found, so jobs are simulated in your browser.
              Start the Spring Boot API to see real data.
            </p>
          )}
          <button
            type="button"
            className="flex items-center gap-2 text-sm text-steel hover:text-ink"
            onClick={() => { setTheme(!dark); setDark(!dark) }}
          >
            {dark ? <Sun size={15} /> : <Moon size={15} />}
            {dark ? 'Light theme' : 'Dark theme'}
          </button>
        </div>
      </aside>

      <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        {api?.mode === 'demo' && (
          <p className="mb-4 rounded border border-molten/40 bg-molten/5 px-3 py-2 text-sm text-steel lg:hidden">
            Demo mode — jobs are simulated in your browser.
          </p>
        )}
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            {description && <p className="mt-1 max-w-2xl text-steel">{description}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {actions}
            <button type="button" className="btn-quiet" onClick={burst} disabled={!api || bursting}>
              <Zap size={14} aria-hidden="true" /> {bursting ? 'Sending…' : 'Send 200 test jobs'}
            </button>
            <button type="button" className="btn-primary" onClick={() => setSubmitOpen(true)} disabled={!api}>
              <Plus size={15} aria-hidden="true" /> Enqueue job
            </button>
          </div>
        </header>
        {api ? children : <p className="text-steel">Connecting to QueueForge…</p>}
      </main>

      <SubmitJobDialog open={submitOpen} onClose={() => setSubmitOpen(false)} />
    </div>
  )
}
