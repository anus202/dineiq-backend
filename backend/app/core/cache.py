"""A small in-memory, per-process TTL cache for expensive read endpoints.

Why not `functools.lru_cache` or a naive `@cache` decorator: every service function here
takes an `AsyncSession` as its first argument (a fresh, non-hashable object created per
request by `Depends(get_db)`), so caching on the full argument tuple would never hit --
every call would look like a new key. `TTLCache.get_or_set` instead takes an explicit key
built from the *filter values* (branch_id, date range, limit, ...), which is what actually
determines whether two calls can share a result.

This is a single-process, in-memory cache: correct and effective for this app's single
Uvicorn worker, but it would not be shared across multiple worker processes. That's a
reasonable trade-off here, not an oversight -- see AI_USAGE.md.
"""
from __future__ import annotations

import asyncio
import time
from typing import Any, Awaitable, Callable, Hashable, TypeVar

T = TypeVar("T")


class TTLCache:
    """One instance per cached function. `key` should be a tuple of the request's actual
    filter values (never the `db` session)."""

    def __init__(self) -> None:
        self._store: dict[Hashable, tuple[float, Any]] = {}
        # Single-flight: while a key's `compute()` is running, a second caller for the same
        # key (e.g. a real request arriving while the background cache-warmup loop is
        # already recomputing it) awaits that same in-flight call instead of starting a
        # second, fully-duplicate expensive query. Without this, two concurrent full-table
        # scans of the same 1M+ row tables were observed to cause real lock contention in
        # SQL Server, making both calls far slower than either alone.
        self._inflight: dict[Hashable, asyncio.Future] = {}

    async def get_or_set(self, key: Hashable, ttl_seconds: float, compute: Callable[[], Awaitable[T]]) -> T:
        now = time.monotonic()
        hit = self._store.get(key)
        if hit is not None and now - hit[0] < ttl_seconds:
            return hit[1]

        inflight = self._inflight.get(key)
        if inflight is not None:
            return await inflight

        task: asyncio.Future = asyncio.ensure_future(compute())
        self._inflight[key] = task
        try:
            value = await task
        finally:
            self._inflight.pop(key, None)
        self._store[key] = (time.monotonic(), value)
        return value

    def get_or_set_sync(self, key: Hashable, ttl_seconds: float, compute: Callable[[], T]) -> T:
        """Same as get_or_set, for the pipeline-backed functions that aren't async
        (market-basket, price-sensitivity, promotion-traps, recommendations). These run to
        completion synchronously within a single event-loop turn, so there's no concurrent
        interleaving to de-duplicate here the way there is for `get_or_set`."""
        now = time.monotonic()
        hit = self._store.get(key)
        if hit is not None and now - hit[0] < ttl_seconds:
            return hit[1]
        value = compute()
        self._store[key] = (now, value)
        return value

    def invalidate(self, key: Hashable) -> None:
        """Drops one cached entry, forcing the next get_or_set for that key to recompute.
        Used by endpoints that accept an explicit refresh=true query param."""
        self._store.pop(key, None)

    def clear(self) -> None:
        self._store.clear()

    def __len__(self) -> int:
        return len(self._store)
