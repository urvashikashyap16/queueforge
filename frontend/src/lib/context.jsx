import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { httpApi, probeBackend } from './api'
import { demoApi } from './demo'

const ApiContext = createContext(null)

const MAX_EVENTS = 120

export function ApiProvider({ children }) {
  const [api, setApi] = useState(null)
  const [connection, setConnection] = useState('connecting')
  const [events, setEvents] = useState([])
  const listeners = useRef(new Set())

  useEffect(() => {
    let cancelled = false
    probeBackend().then((live) => {
      if (!cancelled) setApi(live ? httpApi : demoApi)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!api) return undefined
    return api.subscribe((event) => {
      setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS))
      listeners.current.forEach((fn) => fn(event))
    }, setConnection)
  }, [api])

  /** Components (e.g. the forge line) can react to each event as it happens. */
  const onEvent = useCallback((fn) => {
    listeners.current.add(fn)
    return () => listeners.current.delete(fn)
  }, [])

  return (
    <ApiContext.Provider value={{ api, connection, events, onEvent }}>
      {children}
    </ApiContext.Provider>
  )
}

export function useApi() {
  return useContext(ApiContext)
}

/**
 * Poll a loader on an interval, and also refresh shortly after relevant live events.
 * Returns { data, error, loading, reload }.
 */
export function usePolling(loader, { interval = 3000, deps = [], refreshOnEvents = true } = {}) {
  const { api, onEvent } = useApi()
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  const reload = useCallback(async () => {
    if (!api) return
    try {
      const data = await loaderRef.current(api)
      setState({ data, error: null, loading: false })
    } catch (error) {
      setState((s) => ({ ...s, error, loading: false }))
    }
  }, [api])

  useEffect(() => {
    if (!api) return undefined
    reload()
    const timer = setInterval(reload, interval)
    let debounce = null
    const off = refreshOnEvents
      ? onEvent(() => {
          clearTimeout(debounce)
          debounce = setTimeout(reload, 400)
        })
      : () => {}
    return () => {
      clearInterval(timer)
      clearTimeout(debounce)
      off()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, reload, interval, refreshOnEvents, ...deps])

  return { ...state, reload }
}

/** Re-render every `ms` so relative timestamps ("12s ago") stay fresh. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}
