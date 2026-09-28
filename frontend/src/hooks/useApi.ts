import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { apiErrorMessage } from '../services/api'

export interface ApiState<T> {
  data: T | undefined
  error: string | null
  loading: boolean

  revalidating: boolean
  reload: () => Promise<void>
}

interface CacheEntry {
  data: unknown
  timestamp: number
}

const swrCache = new Map<string, CacheEntry>()

const SWR_MAX_AGE_MS = 15 * 60 * 1000

let activeRevalidations = 0
const revalidationListeners = new Set<() => void>()
function setRevalidatingGlobal(delta: 1 | -1) {
  activeRevalidations = Math.max(0, activeRevalidations + delta)
  revalidationListeners.forEach((listener) => listener())
}

export function useGlobalRevalidating(): boolean {
  const [isRevalidating, setIsRevalidating] = useState(activeRevalidations > 0)
  useEffect(() => {
    const listener = () => setIsRevalidating(activeRevalidations > 0)
    revalidationListeners.add(listener)
    return () => {
      revalidationListeners.delete(listener)
    }
  }, [])
  return isRevalidating
}

export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[], pollMs?: number): ApiState<T> {
  const { pathname } = useLocation()
  const cacheKey = `${pathname}::${fetcher.toString()}::${JSON.stringify(deps)}`
  const cached = swrCache.get(cacheKey)
  const hasUsableCache = !!cached && Date.now() - cached.timestamp < SWR_MAX_AGE_MS

  const [data, setData] = useState<T | undefined>(() => (hasUsableCache ? (cached!.data as T) : undefined))
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!hasUsableCache)
  const [revalidating, setRevalidating] = useState(false)
  const callId = useRef(0)

  const run = useCallback(fetcher, deps)

  const reload = useCallback(async () => {
    const id = ++callId.current
    const isBackgroundRevalidation = swrCache.has(cacheKey)
    if (isBackgroundRevalidation) {
      setRevalidating(true)
      setRevalidatingGlobal(1)
    } else {
      setLoading(true)
    }
    try {
      const result = await run()
      if (id === callId.current) {
        setData(result)
        setError(null)
        swrCache.set(cacheKey, { data: result, timestamp: Date.now() })
      }
    } catch (err) {
      if (id === callId.current) setError(apiErrorMessage(err))
    } finally {
      if (id === callId.current) {
        setLoading(false)
        setRevalidating(false)
      }
      if (isBackgroundRevalidation) setRevalidatingGlobal(-1)
    }
  }, [run, cacheKey])

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

  return { data, error, loading, revalidating, reload }
}

export function useDebounce<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}
