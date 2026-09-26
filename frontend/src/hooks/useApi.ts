import { useCallback, useEffect, useRef, useState } from 'react'
import { apiErrorMessage } from '../services/api'

export interface ApiState<T> {
  data: T | undefined
  error: string | null
  loading: boolean
  reload: () => Promise<void>
}

/**
 * Loads `fetcher()` on mount and whenever `deps` change; `pollMs` refreshes it on an
 * interval (paused while the tab is hidden). Stale responses from superseded calls are
 * ignored, so fast-changing filters never show an older result.
 */
export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[], pollMs?: number): ApiState<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const callId = useRef(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fetcher, deps)

  const reload = useCallback(async () => {
    const id = ++callId.current
    setLoading(true)
    try {
      const result = await run()
      if (id === callId.current) {
        setData(result)
        setError(null)
      }
    } catch (err) {
      if (id === callId.current) setError(apiErrorMessage(err))
    } finally {
      if (id === callId.current) setLoading(false)
    }
  }, [run])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!pollMs) return
    const timer = window.setInterval(() => {
      if (!document.hidden) void reload()
    }, pollMs)
    return () => window.clearInterval(timer)
  }, [reload, pollMs])

  return { data, error, loading, reload }
}

export function useDebounce<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}
