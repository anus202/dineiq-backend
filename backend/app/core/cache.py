from __future__ import annotations

import asyncio
import threading
import time
from typing import Any, Awaitable, Callable, Hashable, TypeVar

T = TypeVar("T")

class TTLCache:

    def __init__(self) -> None:
        self._store: dict[Hashable, tuple[float, Any]] = {}

        self._inflight: dict[Hashable, asyncio.Future] = {}

        self._sync_lock = threading.Lock()

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
        hit = self._store.get(key)
        if hit is not None and time.monotonic() - hit[0] < ttl_seconds:
            return hit[1]
        # Callers run this from worker threads, so a request and the background warm-up can
        # miss at the same time; the lock makes the second one wait for the first result
        # instead of repeating a multi-second computation.
        with self._sync_lock:
            now = time.monotonic()
            hit = self._store.get(key)
            if hit is not None and now - hit[0] < ttl_seconds:
                return hit[1]
            value = compute()
            self._store[key] = (now, value)
            return value

    def invalidate(self, key: Hashable) -> None:
        self._store.pop(key, None)

    def clear(self) -> None:
        self._store.clear()

    def __len__(self) -> int:
        return len(self._store)
