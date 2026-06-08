"""Resolve a free-text city name into coordinates using Open-Meteo geocoding.

Keyless and works worldwide, so CityChilly can target any city the user types.
"""
from __future__ import annotations

from app.config import settings
from app.models import Place
from app.providers.http import build_client


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
