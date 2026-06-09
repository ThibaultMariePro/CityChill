"""CityChilly API + static web app entrypoint."""
from __future__ import annotations

import asyncio
import hashlib
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from app import __version__
from app.api_keys import API_KEY_SPECS
from app.cache import TTLCache
from app.categories import CATEGORIES
from app.i18n import (
    category_label,
    geocode_unavailable,
    normalize_lang,
    notice_activities_degraded,
    notice_no_activities,
)
from app.config import settings
from app.models import DiscoverResponse, Item, Place, Weather, WeatherHint
from app.providers.activities import get_activities
from app.providers.events import get_events, verify_openagenda_key
from app.providers.geocode import _make_pin_id, geocode_city, search_places
from app.providers.weather import get_weather
from app.theme import active_palette, generate_css, list_palettes

@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Drop discover rows cached before an OpenAgenda key was configured.
    if settings.OPENAGENDA_KEY:
        removed = cache.clear_where(lambda k: "::oa-none::" in k)
        if removed:
            import logging

            logging.getLogger("citychilly").info(
                "Cleared %d stale discover cache entries (no OpenAgenda key).",
                removed,
            )
    yield


app = FastAPI(
    title="CityChilly API",
    version=__version__,
    description="Discover activities and outdoor events for any city.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

cache = TTLCache(settings.CACHE_TTL_SECONDS)

WEB_DIR = Path(__file__).resolve().parent.parent / "web"


_OA_KEY_PREFIX = "oa_"
_OA_KEY_MAX_LEN = 200


def _normalize_client_key(openagenda_key: str | None) -> str | None:
    """Ignore blank or malformed client keys so the server env key can be used."""
    if not openagenda_key:
        return None
    key = openagenda_key.strip()
    if not key or len(key) > _OA_KEY_MAX_LEN or not key.startswith(_OA_KEY_PREFIX):
        return None
    return key


def _discover_cache_usable(
    cached: DiscoverResponse,
    *,
    live_events_only: bool,
) -> bool:
    """Reject stale rows that pre-date an OpenAgenda key (curated-only snapshots)."""
    if live_events_only or not settings.OPENAGENDA_KEY:
        return True
    return any("openagenda" in (event.tags or []) for event in cached.events)


def _openagenda_cache_tag(openagenda_key: str | None) -> str:
    """Short cache suffix so discover results differ when the OA key changes."""
    key = _normalize_client_key(openagenda_key) or (settings.OPENAGENDA_KEY or "")
    if not key:
        return "oa-none"
    return "oa-" + hashlib.sha256(key.encode()).hexdigest()[:10]


def _attach_weather(items: list[Item], weather) -> None:
    """Add a weather hint to outdoor items, keyed by their date (or today)."""
    if not weather.days:
        return
    by_date = {d.date: d for d in weather.days}
    first_day = weather.days[0]
    for item in items:
        if not item.is_outdoor:
            continue
        day = by_date.get(item.start) if item.start else None
        day = day or first_day
        item.weather = WeatherHint(
            date=day.date,
            emoji=day.emoji,
            summary=day.summary,
            outdoor_score=day.outdoor_score,
            temp_max=day.temp_max,
        )


@app.post("/api/cache/clear")
async def clear_cache() -> dict:
    """Flush the in-memory API response cache (discover, geocode, …)."""
    removed = cache.clear()
    return {"cleared": removed}


@app.get("/api/health")
async def health(
    openagenda_key: str | None = Query(default=None),
) -> dict:
    """Liveness plus OpenAgenda key validation (cached ~20s per key)."""
    client_key = _normalize_client_key(openagenda_key)
    oa_tag = _openagenda_cache_tag(client_key)
    oa_bucket = int(time.time() // 20)
    oa_cache_key = f"health::oa::{oa_tag}::{oa_bucket}"
    cached_oa = cache.get(oa_cache_key)
    if cached_oa is None:
        oa = await verify_openagenda_key(client_key)
        cache.set(oa_cache_key, oa)
    else:
        oa = cached_oa

    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "version": __version__,
        "openagenda_enabled": bool(settings.OPENAGENDA_KEY),
        "openagenda": oa,
        "connection_ok": bool(oa.get("configured") and oa.get("valid")),
        "default_country": settings.DEFAULT_COUNTRY,
        "default_city": settings.DEFAULT_CITY,
    }


@app.get("/api/geocode")
async def geocode_suggest(
    q: str = Query(..., min_length=1, max_length=200),
    count: int = Query(default=8, ge=1, le=15),
    lang: str = Query(default="en", max_length=8),
) -> dict:
    """Return autocomplete suggestions for a city name or postal code."""
    q = q.strip()
    lng = normalize_lang(lang)
    cache_key = f"geocode::{q.lower()}::{count}::{lng}::fr-priority"
    cached = cache.get(cache_key)
    if cached:
        return cached
    try:
        suggestions = await search_places(q, count, lang=lng)
        result: dict = {"suggestions": [s.model_dump() for s in suggestions]}
    except Exception:
        result = {"suggestions": []}
    cache.set(cache_key, result)
    return result


@app.get("/api/theme.css")
async def theme_css(
    palette: str | None = Query(default=None, max_length=40, pattern=r"^[a-z0-9\-]+$"),
) -> Response:
    """Palette CSS generated from config/theme.json (overrides styles.css)."""
    return Response(
        content=generate_css(palette),
        media_type="text/css",
        headers={"Cache-Control": "no-cache, must-revalidate"},
    )


@app.get("/api/theme")
async def theme_info() -> dict:
    pid, palette = active_palette()
    return {
        "active": pid,
        "label": palette.get("label", pid),
        "palettes": list_palettes(),
    }


@app.get("/api/keys")
async def api_keys() -> dict:
    """Describe optional API keys and whether the server has them via env vars."""
    return {
        "keys": [
            {
                **spec,
                "server_configured": bool(settings.OPENAGENDA_KEY)
                if spec["id"] == "openagenda_key"
                else False,
            }
            for spec in API_KEY_SPECS
        ]
    }


@app.get("/api/categories")
async def categories(lang: str = Query(default="en", max_length=8)) -> dict:
    lng = normalize_lang(lang)
    return {
        "categories": [
            {
                "id": cid,
                "label": category_label(cid, lng),
                "emoji": meta["emoji"],
            }
            for cid, meta in CATEGORIES.items()
        ]
    }


@app.get("/api/discover", response_model=DiscoverResponse)
async def discover(
    city: str | None = Query(default=None, min_length=1, max_length=120),
    country: str | None = Query(default=None, max_length=120),
    lat: float | None = Query(default=None, ge=-90.0, le=90.0),
    lon: float | None = Query(default=None, ge=-180.0, le=180.0),
    place_name: str | None = Query(default=None, max_length=200),
    city_name: str | None = Query(default=None, max_length=120),
    openagenda_key: str | None = Query(default=None),
    live_events_only: bool = Query(default=False),
    refresh: bool = Query(default=False),
    lang: str = Query(default="en", max_length=8),
) -> DiscoverResponse:
    client_key = _normalize_client_key(openagenda_key)
    oa_tag = _openagenda_cache_tag(client_key)
    live_tag = "live" if live_events_only else "all"
    lng = normalize_lang(lang)

    # ── Coordinate-based path (skips geocoding, used by pinned locations) ──
    if lat is not None and lon is not None:
        display = place_name or f"{lat:.3f}, {lon:.3f}"
        effective_city = (city_name or "").strip()
        cache_key = (
            f"discover::coords::{_make_pin_id(lat, lon)}::"
            f"{effective_city.lower()}::{oa_tag}::{live_tag}::{lng}"
        )
        if not refresh:
            cached = cache.get(cache_key)
            if cached and _discover_cache_usable(cached, live_events_only=live_events_only):
                return cached
        place = Place(
            name=display,
            latitude=lat,
            longitude=lon,
            source_url=f"https://www.openstreetmap.org/#map=13/{lat}/{lon}",
        )

    # ── City-name path (geocodes on the server, backward-compatible) ──
    else:
        effective_city = (city or "").strip() or settings.DEFAULT_CITY
        effective_country = (country or "").strip() or settings.DEFAULT_COUNTRY
        cache_key = (
            f"discover::{effective_city.lower()}::"
            f"{effective_country.lower()}::{oa_tag}::{live_tag}::{lng}"
        )
        if not refresh:
            cached = cache.get(cache_key)
            if cached and _discover_cache_usable(cached, live_events_only=live_events_only):
                return cached
        try:
            place = await geocode_city(effective_city, effective_country, lang=lng)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc))
        except Exception:
            raise HTTPException(status_code=502, detail=geocode_unavailable(lng))

    weather, activities_result, events_result = await asyncio.gather(
        get_weather(place.latitude, place.longitude, lang=lng),
        get_activities(place),
        get_events(
            place,
            openagenda_key=client_key,
            lang=lng,
            city_name=city_name or (city or "").strip() or None,
            live_only=live_events_only,
        ),
        return_exceptions=True,
    )

    # Weather and events are designed to never raise; guard just in case.
    if isinstance(weather, BaseException):
        weather = Weather(source_url="https://open-meteo.com/", days=[])
    if isinstance(events_result, BaseException):
        events, notices = [], []
    else:
        events, notices = events_result

    # Activities may raise ProviderError when every Overpass mirror is down.
    activities_degraded = False
    if isinstance(activities_result, BaseException):
        activities = []
        activities_degraded = True
        notices.append(notice_activities_degraded(lng))
    else:
        activities = activities_result
        if not activities:
            notices.append(notice_no_activities(place.name, lng))

    _attach_weather(activities, weather)
    _attach_weather(events, weather)

    response = DiscoverResponse(
        place=place,
        weather=weather,
        activities=activities,
        events=events,
        notices=notices,
    )
    # Never cache a degraded result, otherwise a transient Overpass outage would
    # be "stuck" for the whole cache window. Cache only successful lookups.
    if not activities_degraded and _discover_cache_usable(
        response, live_events_only=live_events_only
    ):
        cache.set(cache_key, response)
    return response


# --- Static web app -------------------------------------------------------

if WEB_DIR.exists():
    app.mount("/assets", StaticFiles(directory=WEB_DIR / "assets"), name="assets")

    @app.get("/")
    async def index() -> FileResponse:
        return FileResponse(WEB_DIR / "index.html")

    _STATIC_NO_CACHE = {"Cache-Control": "no-cache, must-revalidate"}

    @app.get("/app.js")
    async def appjs() -> FileResponse:
        return FileResponse(WEB_DIR / "app.js", headers=_STATIC_NO_CACHE)

    @app.get("/i18n.js")
    async def i18njs() -> FileResponse:
        return FileResponse(WEB_DIR / "i18n.js", headers=_STATIC_NO_CACHE)

    @app.get("/styles.css")
    async def styles() -> FileResponse:
        return FileResponse(WEB_DIR / "styles.css", headers=_STATIC_NO_CACHE)

    @app.get("/manifest.webmanifest")
    async def manifest() -> FileResponse:
        return FileResponse(WEB_DIR / "manifest.webmanifest")
else:  # pragma: no cover

    @app.get("/")
    async def index_missing() -> JSONResponse:
        return JSONResponse({"message": "CityChilly API is running."})
