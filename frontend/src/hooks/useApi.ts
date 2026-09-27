import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { apiErrorMessage } from '../services/api'

export interface ApiState<T> {
  data: T | undefined
  error: string | null
  loading: boolean
  /** True while a background refresh is in flight and stale `data` is already on screen --
   * distinct from `loading`, which is only true when there is nothing to show yet. */
  revalidating: boolean
  reload: () => Promise<void>
}

interface CacheEntry {
  data: unknown
  timestamp: number
}

// Module-scoped so it survives a page unmount/remount (switching sidebar pages and back)
// but not a full browser reload: a stale-while-revalidate cache of each call site's last
// successful response. The key is derived automatically from the route plus the fetcher's
// own source text (stable across renders of the same call site, distinct between different
// call sites even when their `deps` are both `[]`), so callers never hand-write a cache key.
const swrCache = new Map<string, CacheEntry>()

// A cached hit is only ever an instant first paint, never trusted as fresh on its own --
// `reload` below always revalidates it in the background regardless of age. This just caps
// how long a genuinely abandoned entry is kept before it's ignored as a first paint.
const SWR_MAX_AGE_MS = 15 * 60 * 1000

// A tiny global pub-sub so a single "syncing" indicator in the header can reflect whether
// *any* page's data is being revalidated in the background, without prop-drilling.
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

/**
 * Loads `fetcher()` on mount and whenever `deps` change; `pollMs` refreshes it on an
 * interval (paused while the tab is hidden). Stale responses from superseded calls are
 * ignored, so fast-changing filters never show an older result.
 *
 * Stale-while-revalidate: if this exact call site has a cached response from earlier in
 * the session, it's shown immediately (`loading` starts `false`) while a fresh copy is
 * fetched silently in the background (`revalidating` is `true` meanwhile) -- switching
 * between sidebar pages never shows a blank spinner for data already seen this session.
 */
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
