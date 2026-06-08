"""Shared async HTTP client helpers."""
from __future__ import annotations

import asyncio
import logging

import httpx

from app.config import settings

logger = logging.getLogger("citychilly")


class ProviderError(RuntimeError):
    """Raised when an upstream data source could not be reached/served."""


def build_client(timeout: float | None = None) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=timeout or settings.HTTP_TIMEOUT,
        headers={"User-Agent": settings.USER_AGENT},
        follow_redirects=True,
    )


async def run_overpass(query: str) -> dict:
    """Run an Overpass query, trying each configured mirror with light retries.

    Raises ProviderError if every mirror fails (rate limit, timeout, 5xx...).
    """
    last_error: str = "no endpoints configured"
    async with build_client(timeout=settings.OVERPASS_TIMEOUT) as client:
        for url in settings.OVERPASS_URLS:
            for attempt in range(2):
                try:
                    resp = await client.post(url, data={"data": query})
                except Exception as exc:  # network / timeout
                    last_error = f"{url}: {type(exc).__name__}"
                    logger.warning("Overpass call failed (%s): %s", url, exc)
                    await asyncio.sleep(0.5 * (attempt + 1))
                    continue

                if resp.status_code == 200:
                    try:
                        return resp.json()
                    except Exception as exc:
                        last_error = f"{url}: bad JSON ({exc})"
                        break  # try next mirror
                # 429/504/503 -> overloaded, back off then retry/next mirror
                last_error = f"{url}: HTTP {resp.status_code}"
                logger.warning("Overpass %s returned HTTP %s", url, resp.status_code)
                if resp.status_code in (429, 503, 504):
                    await asyncio.sleep(0.7 * (attempt + 1))
                    continue
                break  # other status codes: move to next mirror

    raise ProviderError(f"All Overpass endpoints failed ({last_error}).")
