"""CityChilly API + static web app entrypoint."""
from __future__ import annotations

import asyncio
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from app import __version__
from app.cache import TTLCache
from app.categories import CATEGORIES
from app.config import settings
from app.models import DiscoverResponse, Item, Weather, WeatherHint
from app.providers.activities import get_activities
from app.providers.events import get_events
from app.providers.geocode import geocode_city
from app.providers.weather import get_weather
from app.theme import active_palette, generate_css, list_palettes

app = FastAPI(
    title="CityChilly API",
    version=__version__,
    description="Discover activities and outdoor events for any city.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

cache = TTLCache(settings.CACHE_TTL_SECONDS)

WEB_DIR = Path(__file__).resolve().parent.parent / "web"


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


@app.get("/api/health")
async def health() -> dict:
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "version": __version__,
        "openagenda_enabled": bool(settings.OPENAGENDA_KEY),
    }


@app.get("/api/theme.css")
async def theme_css() -> Response:
    """Palette CSS generated from config/theme.json (overrides styles.css)."""
    return Response(
        content=generate_css(),
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


@app.get("/api/categories")
async def categories() -> dict:
    return {
        "categories": [
            {"id": cid, "label": meta["label"], "emoji": meta["emoji"]}
            for cid, meta in CATEGORIES.items()
        ]
    }


@app.get("/api/discover", response_model=DiscoverResponse)
async def discover(
    city: str = Query(default=settings.DEFAULT_CITY, min_length=1, max_length=120),
    country: str | None = Query(default=None, max_length=120),
) -> DiscoverResponse:
    cache_key = f"discover::{city.lower().strip()}::{(country or '').lower().strip()}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    try:
        place = await geocode_city(city, country)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        raise HTTPException(
            status_code=502, detail="City lookup service is temporarily unavailable."
        )

    weather, activities_result, events_result = await asyncio.gather(
        get_weather(place.latitude, place.longitude),
        get_activities(place),
        get_events(place),
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
        notices.append(
            "Live activities are temporarily unavailable (the OpenStreetMap "
            "service is busy). Please try again in a moment \u2014 this usually "
            "fixes itself within seconds."
        )
    else:
        activities = activities_result
        if not activities:
            notices.append(
                f"We couldn't find tagged activities near {place.name} right now. "
                "Try a larger or differently-spelled city name."
            )

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
    if not activities_degraded:
        cache.set(cache_key, response)
    return response


# --- Static web app -------------------------------------------------------

if WEB_DIR.exists():
    app.mount("/assets", StaticFiles(directory=WEB_DIR / "assets"), name="assets")

    @app.get("/")
    async def index() -> FileResponse:
        return FileResponse(WEB_DIR / "index.html")

    @app.get("/app.js")
    async def appjs() -> FileResponse:
        return FileResponse(WEB_DIR / "app.js")

    @app.get("/styles.css")
    async def styles() -> FileResponse:
        return FileResponse(WEB_DIR / "styles.css")

    @app.get("/manifest.webmanifest")
    async def manifest() -> FileResponse:
        return FileResponse(WEB_DIR / "manifest.webmanifest")
else:  # pragma: no cover

    @app.get("/")
    async def index_missing() -> JSONResponse:
        return JSONResponse({"message": "CityChilly API is running."})
