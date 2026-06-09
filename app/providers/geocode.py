"""Resolve a free-text city name (or postal code) into coordinates.

Uses Open-Meteo geocoding worldwide and geo.api.gouv.fr for French postcodes.
"""
from __future__ import annotations

import re
import unicodedata

from app.config import settings
from app.i18n import city_not_found, normalize_lang
from app.models import Place, PlaceSuggestion
from app.providers.http import build_client

_FR_COMMUNES_API = "https://geo.api.gouv.fr/communes"
_POSTCODE_RE = re.compile(r"^\d{4,6}$")
_FR_COUNTRY_NAMES = frozenset({"france", "frankreich", "francia", "frankrijk"})


def _is_french_result(result: dict) -> bool:
    if (result.get("country_code") or "").upper() == "FR":
        return True
    return (result.get("country") or "").strip().lower() in _FR_COUNTRY_NAMES


def _normalize_geocode_name(name: str) -> str:
    name = name.strip().lower()
    name = unicodedata.normalize("NFD", name)
    return "".join(c for c in name if unicodedata.category(c) != "Mn")


def _geocode_result_score(
    result: dict, query: str, *, preferred_country: str | None
) -> tuple[int, int, int, int, int]:
    """Rank Open-Meteo hits: France first, then preferred country, name match, population."""
    name = _normalize_geocode_name(result.get("name") or "")
    q = _normalize_geocode_name(query)
    country = (result.get("country") or "").lower()
    pref = (preferred_country or settings.DEFAULT_COUNTRY or "").strip().lower()

    exact = name == q
    prefix = name.startswith(q) or q.startswith(name) or q in name
    country_pref = bool(pref and country == pref)
    pop = int(result.get("population") or 0)

    return (
        1 if _is_french_result(result) else 0,
        1 if country_pref else 0,
        1 if exact else 0,
        1 if prefix else 0,
        pop,
    )


def _pick_geocode_result(
    results: list[dict], query: str, country: str | None = None
) -> dict:
    preferred = (country or "").strip() or settings.DEFAULT_COUNTRY
    return max(
        results,
        key=lambda r: _geocode_result_score(r, query, preferred_country=preferred),
    )


def _sort_geocode_results(
    results: list[dict], query: str, country: str | None = None
) -> list[dict]:
    preferred = (country or "").strip() or settings.DEFAULT_COUNTRY
    return sorted(
        results,
        key=lambda r: _geocode_result_score(r, query, preferred_country=preferred),
        reverse=True,
    )


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
                    _FR_COMMUNES_API,
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
    params = {"name": clean, "count": 5, "language": "en", "format": "json"}  # postcode digits
    async with build_client() as client:
        resp = await client.get(settings.GEOCODE_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

    for r in _sort_geocode_results(data.get("results") or [], clean):
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


def _admin_name(value) -> str | None:
    if isinstance(value, dict):
        return value.get("nom") or value.get("name")
    return value if isinstance(value, str) else None


def _suggestion_from_commune(commune: dict) -> PlaceSuggestion | None:
    centre = commune.get("centre") or {}
    coords = centre.get("coordinates") or []
    if len(coords) < 2:
        return None

    lon, lat = float(coords[0]), float(coords[1])
    postcodes = _clean_postcodes(commune.get("codesPostaux") or [])
    name = commune.get("nom") or ""
    dept = _admin_name(commune.get("departement"))
    region = _admin_name(commune.get("region"))

    if len(postcodes) > 1:
        kind = "area"
        pin_id = f"area:{_make_pin_id(lat, lon)}"
        postcode = None
    elif len(postcodes) == 1:
        kind = "postcode"
        pin_id = _make_postcode_pin_id(postcodes[0])
        postcode = postcodes[0]
    else:
        kind = "place"
        pin_id = _make_pin_id(lat, lon)
        postcode = None

    display = ", ".join(p for p in [name, dept or region, "France"] if p)

    return PlaceSuggestion(
        id=pin_id,
        kind=kind,
        postcode=postcode,
        name=name,
        display=display,
        country="France",
        country_code="FR",
        admin1=region,
        latitude=lat,
        longitude=lon,
        timezone="Europe/Paris",
        population=commune.get("population"),
        postcodes=postcodes,
    )


async def _search_french_communes(query: str, limit: int) -> list[PlaceSuggestion]:
    """French commune directory — primary source for the search autocomplete."""
    try:
        async with build_client() as client:
            resp = await client.get(
                _FR_COMMUNES_API,
                params={
                    "nom": query,
                    "fields": "nom,code,codesPostaux,centre,population,departement,region",
                    "boost": "population",
                    "limit": min(limit, 15),
                },
            )
            resp.raise_for_status()
            communes = resp.json()
    except Exception:
        return []

    ranked = sorted(
        communes,
        key=lambda c: _geocode_result_score(
            {
                "name": c.get("nom"),
                "country": "France",
                "country_code": "FR",
                "population": c.get("population") or 0,
            },
            query,
            preferred_country="France",
        ),
        reverse=True,
    )

    suggestions: list[PlaceSuggestion] = []
    seen_ids: set[str] = set()
    for commune in ranked:
        suggestion = _suggestion_from_commune(commune)
        if not suggestion or suggestion.id in seen_ids:
            continue
        seen_ids.add(suggestion.id)
        suggestions.append(suggestion)
    return suggestions


def _suggestion_location_key(suggestion: PlaceSuggestion) -> str:
    return f"{suggestion.latitude:.2f},{suggestion.longitude:.2f}"


def _merge_suggestions(
    primary: list[PlaceSuggestion],
    extra: list[PlaceSuggestion],
    *,
    limit: int,
) -> list[PlaceSuggestion]:
    seen_ids: set[str] = set()
    seen_locations: set[str] = set()
    merged: list[PlaceSuggestion] = []

    for suggestion in primary + extra:
        if suggestion.id in seen_ids:
            continue
        loc = _suggestion_location_key(suggestion)
        if loc in seen_locations:
            continue
        seen_ids.add(suggestion.id)
        seen_locations.add(loc)
        merged.append(suggestion)
        if len(merged) >= limit:
            break
    return merged


async def _search_openmeteo_places(
    query: str, count: int, *, lang: str = "en"
) -> list[PlaceSuggestion]:
    params = {
        "name": query,
        "count": min(count, 15),
        "language": normalize_lang(lang),
        "format": "json",
    }
    async with build_client() as client:
        resp = await client.get(settings.GEOCODE_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

    suggestions: list[PlaceSuggestion] = []
    seen_ids: set[str] = set()
    for r in _sort_geocode_results(data.get("results") or [], query):
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
        suggestion = _suggestion_from_result(
            r, kind=kind, postcode=postcode if kind == "postcode" else None
        )
        if len(postcodes) > 1:
            suggestion = suggestion.model_copy(
                update={"id": pin_id, "kind": "area", "postcode": None, "postcodes": postcodes}
            )
        suggestions.append(suggestion)
    return suggestions


async def search_places(query: str, count: int = 8, *, lang: str = "en") -> list[PlaceSuggestion]:
    """Return geocoding suggestions for *query* (city name or postal code)."""
    q = query.strip()
    if not q:
        return []

    # Direct postal-code lookup — one precise suggestion per code.
    if _looks_like_postcode(q):
        resolved = await geocode_postcode(q)
        return [resolved] if resolved else []

    french = await _search_french_communes(q, count)
    if len(french) >= count:
        return french[:count]

    international = await _search_openmeteo_places(
        q, max(count - len(french), count), lang=lang
    )
    return _merge_suggestions(french, international, limit=count)


async def geocode_city(city: str, country: str | None = None, *, lang: str = "en") -> Place:
    params = {
        "name": city,
        "count": 10,
        "language": normalize_lang(lang),
        "format": "json",
    }
    async with build_client() as client:
        resp = await client.get(settings.GEOCODE_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

    results = data.get("results") or []
    if not results:
        raise ValueError(city_not_found(city, lang))

    chosen = _pick_geocode_result(results, city, country)

    osm_url = (
        f"https://www.openstreetmap.org/#map=13/"
        f"{chosen['latitude']}/{chosen['longitude']}"
    )
    return Place(
        name=chosen.get("name", city),
        country=chosen.get("country"),
        admin=chosen.get("admin1"),
        admin2=chosen.get("admin2"),
        admin3=chosen.get("admin3"),
        latitude=chosen["latitude"],
        longitude=chosen["longitude"],
        timezone=chosen.get("timezone"),
        source_url=osm_url,
    )
