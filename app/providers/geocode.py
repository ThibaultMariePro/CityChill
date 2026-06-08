"""Resolve a free-text city name (or postal code) into coordinates.

Uses Open-Meteo geocoding worldwide and geo.api.gouv.fr for French postcodes.
"""
from __future__ import annotations

import re

from app.config import settings
from app.models import Place, PlaceSuggestion
from app.providers.http import build_client

_FR_POSTCODE_API = "https://geo.api.gouv.fr/communes"
_POSTCODE_RE = re.compile(r"^\d{4,6}$")


def _make_pin_id(lat: float, lon: float) -> str:
    """Stable ID based on rounded coordinates."""
    return f"{lat:.3f},{lon:.3f}"


def _make_postcode_pin_id(postcode: str) -> str:
    return f"pc:{postcode.strip()}"


def _clean_postcodes(raw: list[str]) -> list[str]:
    """Keep only plain numeric postal codes (drop CEDEX variants, etc.)."""
    seen: set[str] = set()
    out: list[str] = []
    for code in raw:
        code = (code or "").strip()
        if not _POSTCODE_RE.match(code):
            continue
        if code in seen:
            continue
        seen.add(code)
        out.append(code)
    return sorted(out)


def _looks_like_postcode(query: str) -> bool:
    return bool(_POSTCODE_RE.match(query.strip()))


async def geocode_postcode(postcode: str) -> PlaceSuggestion | None:
    """Resolve a single postal code to coordinates (French API first, then Open-Meteo)."""
    clean = postcode.strip()
    if not _POSTCODE_RE.match(clean):
        return None

    # French 5-digit codes — geo.api.gouv.fr gives commune-level centres.
    if len(clean) == 5:
        try:
            async with build_client() as client:
                resp = await client.get(
                    _FR_POSTCODE_API,
                    params={
                        "codePostal": clean,
                        "fields": "nom,code,codesPostaux,centre",
                        "limit": 10,
                    },
                )
                resp.raise_for_status()
                communes = resp.json()
            if communes:
                chosen = communes[0]
                centre = chosen.get("centre") or {}
                coords = centre.get("coordinates") or []
                if len(coords) >= 2:
                    lon, lat = float(coords[0]), float(coords[1])
                    commune = chosen.get("nom") or clean
                    return PlaceSuggestion(
                        id=_make_postcode_pin_id(clean),
                        kind="postcode",
                        postcode=clean,
                        name=commune,
                        display=f"{clean} · {commune}",
                        country="France",
                        country_code="FR",
                        latitude=lat,
                        longitude=lon,
                        postcodes=[clean],
                    )
        except Exception:
            pass

    # Fallback: Open-Meteo (worldwide, less precise for individual codes).
    params = {"name": clean, "count": 5, "language": "en", "format": "json"}
    async with build_client() as client:
        resp = await client.get(settings.GEOCODE_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

    for r in data.get("results") or []:
        lat, lon = r.get("latitude"), r.get("longitude")
        if lat is None or lon is None:
            continue
        name = r.get("name") or clean
        parts = [clean, name, r.get("admin1"), r.get("country")]
        display = " · ".join(p for p in parts[:2] if p)
        if r.get("country") and r.get("country") not in display:
            display = f"{display}, {r['country']}" if display else r["country"]
        return PlaceSuggestion(
            id=_make_postcode_pin_id(clean),
            kind="postcode",
            postcode=clean,
            name=name,
            display=display,
            country=r.get("country"),
            country_code=r.get("country_code"),
            admin1=r.get("admin1"),
            latitude=lat,
            longitude=lon,
            timezone=r.get("timezone"),
            population=r.get("population"),
            postcodes=[clean],
        )
    return None


def _suggestion_from_result(r: dict, *, kind: str, postcode: str | None = None) -> PlaceSuggestion:
    lat, lon = r["latitude"], r["longitude"]
    postcodes = _clean_postcodes(r.get("postcodes") or [])
    parts = [p for p in [r.get("name"), r.get("admin1"), r.get("country")] if p]
    pin_id = _make_postcode_pin_id(postcode) if postcode else _make_pin_id(lat, lon)
    display = (
        f"{postcode} · {r.get('name') or postcode}"
        if postcode
        else ", ".join(parts)
    )
    return PlaceSuggestion(
        id=pin_id,
        kind=kind,
        postcode=postcode,
        name=r.get("name") or postcode or "",
        display=display,
        country=r.get("country"),
        country_code=r.get("country_code"),
        admin1=r.get("admin1"),
        latitude=lat,
        longitude=lon,
        timezone=r.get("timezone"),
        population=r.get("population"),
        postcodes=postcodes if kind == "area" else ([postcode] if postcode else postcodes),
    )


async def search_places(query: str, count: int = 8) -> list[PlaceSuggestion]:
    """Return geocoding suggestions for *query* (city name or postal code)."""
    q = query.strip()
    if not q:
        return []

    # Direct postal-code lookup — one precise suggestion per code.
    if _looks_like_postcode(q):
        resolved = await geocode_postcode(q)
        return [resolved] if resolved else []

    params = {"name": q, "count": min(count, 15), "language": "en", "format": "json"}
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

        postcodes = _clean_postcodes(r.get("postcodes") or [])
        if len(postcodes) > 1:
            kind = "area"
            pin_id = f"area:{_make_pin_id(lat, lon)}"
        elif len(postcodes) == 1:
            kind = "postcode"
            pin_id = _make_postcode_pin_id(postcodes[0])
        else:
            kind = "place"
            pin_id = _make_pin_id(lat, lon)

        if pin_id in seen_ids:
            continue
        seen_ids.add(pin_id)

        postcode = postcodes[0] if len(postcodes) == 1 else None
        suggestions.append(
            _suggestion_from_result(r, kind=kind, postcode=postcode if kind == "postcode" else None)
        )
        # Overwrite id/kind for multi-postcode areas.
        if len(postcodes) > 1:
            suggestions[-1] = suggestions[-1].model_copy(
                update={"id": pin_id, "kind": "area", "postcode": None, "postcodes": postcodes}
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
