"""Resolve a free-text city name (or postal code) into coordinates.

Uses the Open-Meteo geocoding API — keyless and works worldwide.
"""
from __future__ import annotations

from app.config import settings
from app.models import Place, PlaceSuggestion
from app.providers.http import build_client


def _make_pin_id(lat: float, lon: float) -> str:
    """Stable ID based on rounded coordinates so city-name and lat/lon lookups agree."""
    return f"{lat:.3f},{lon:.3f}"


async def search_places(query: str, count: int = 8) -> list[PlaceSuggestion]:
    """Return up to *count* geocoding suggestions for *query* (city name or postal code)."""
    params = {"name": query, "count": min(count, 15), "language": "en", "format": "json"}
    async with build_client() as client:
        resp = await client.get(settings.GEOCODE_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

    suggestions: list[PlaceSuggestion] = []
    seen_ids: set[str] = set()
    for r in data.get("results") or []:
        lat, lon = r.get("latitude"), r.get("longitude")
        if lat is None or lon is None:
            continue
        pin_id = _make_pin_id(lat, lon)
        if pin_id in seen_ids:
            continue
        seen_ids.add(pin_id)

        parts = [p for p in [r.get("name"), r.get("admin1"), r.get("country")] if p]
        suggestions.append(
            PlaceSuggestion(
                id=pin_id,
                name=r.get("name") or "",
                display=", ".join(parts),
                country=r.get("country"),
                country_code=r.get("country_code"),
                admin1=r.get("admin1"),
                latitude=lat,
                longitude=lon,
                timezone=r.get("timezone"),
                population=r.get("population"),
                postcodes=r.get("postcodes") or [],
            )
        )
    return suggestions


async def geocode_city(city: str, country: str | None = None) -> Place:
    params = {
        "name": city,
        "count": 10,
        "language": "en",
        "format": "json",
    }
    async with build_client() as client:
        resp = await client.get(settings.GEOCODE_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

    results = data.get("results") or []
    if not results:
        raise ValueError(f"Could not find a city named '{city}'.")

    chosen = results[0]
    if country:
        for r in results:
            if (r.get("country") or "").lower() == country.lower():
                chosen = r
                break

    osm_url = (
        f"https://www.openstreetmap.org/#map=13/"
        f"{chosen['latitude']}/{chosen['longitude']}"
    )
    return Place(
        name=chosen.get("name", city),
        country=chosen.get("country"),
        admin=chosen.get("admin1"),
        latitude=chosen["latitude"],
        longitude=chosen["longitude"],
        timezone=chosen.get("timezone"),
        source_url=osm_url,
    )
