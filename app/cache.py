"""A tiny thread-safe in-memory TTL cache.

Keeps CityChilly snappy and friendly to upstream open APIs by avoiding
duplicate requests for the same city within a short window.
"""
from __future__ import annotations

import threading
import time
from typing import Any, Callable, Awaitable


class TTLCache:
    def __init__(self, ttl_seconds: int) -> None:
        self._ttl = ttl_seconds
        self._store: dict[str, tuple[float, Any]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Any | None:
        with self._lock:
            entry = self._store.get(key)
            if not entry:
                return None
            expires_at, value = entry
            if time.time() > expires_at:
                self._store.pop(key, None)
                return None
            return value

    def set(self, key: str, value: Any) -> None:
        with self._lock:
            self._store[key] = (time.time() + self._ttl, value)

    def clear(self) -> int:
        """Drop every cached entry. Returns how many keys were removed."""
        with self._lock:
            count = len(self._store)
            self._store.clear()
            return count

    def clear_where(self, predicate: Callable[[str], bool]) -> int:
        """Drop cache entries whose key matches predicate. Returns count removed."""
        with self._lock:
            doomed = [k for k in self._store if predicate(k)]
            for k in doomed:
                del self._store[k]
            return len(doomed)

    async def get_or_set(self, key: str, factory: Callable[[], Awaitable[Any]]) -> Any:
        cached = self.get(key)
        if cached is not None:
            return cached
        value = await factory()
        self.set(key, value)
        return value
