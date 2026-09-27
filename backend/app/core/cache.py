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

import time
from typing import Any, Awaitable, Callable, Hashable, TypeVar

T = TypeVar("T")


class TTLCache:
    """One instance per cached function. `key` should be a tuple of the request's actual
    filter values (never the `db` session)."""

    def __init__(self) -> None:
        self._store: dict[Hashable, tuple[float, Any]] = {}

    async def get_or_set(self, key: Hashable, ttl_seconds: float, compute: Callable[[], Awaitable[T]]) -> T:
        now = time.monotonic()
        hit = self._store.get(key)
        if hit is not None and now - hit[0] < ttl_seconds:
            return hit[1]
        value = await compute()
        self._store[key] = (now, value)
        return value

    def get_or_set_sync(self, key: Hashable, ttl_seconds: float, compute: Callable[[], T]) -> T:
        """Same as get_or_set, for the pipeline-backed functions that aren't async
        (market-basket, price-sensitivity, promotion-traps, recommendations)."""
        now = time.monotonic()
        hit = self._store.get(key)
        if hit is not None and now - hit[0] < ttl_seconds:
            return hit[1]
        value = compute()
        self._store[key] = (now, value)
        return value

    def clear(self) -> None:
        self._store.clear()

    def __len__(self) -> int:
        return len(self._store)
