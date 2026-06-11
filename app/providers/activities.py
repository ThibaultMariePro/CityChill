"""Discover permanent "things to do" around a city via OpenStreetMap Overpass.

Keyless and global. Returns parks, museums, viewpoints, sports venues, etc.
Each item links back to its OpenStreetMap object (or official website when known)
so the user always has a clickable source.
"""
from __future__ import annotations

import asyncio
import hashlib

from app.categories import (
    OSM_TAG_TO_CATEGORY,
    OUTDOOR_CATEGORIES,
    category_label,
    resolve_keyword,
)
from app.config import settings
from app.models import Item, Place
from app.providers.http import run_overpass

# Build regex value lists per OSM key, split so parks/museums are not crowded out
# by bars and cafés in a single Overpass output cap.
_KEY_VALUES_PRIORITY: dict[str, list[str]] = {}
_KEY_VALUES_GENERAL: dict[str, list[str]] = {}
_PRIORITY_CATEGORIES = frozenset({"nature", "culture", "family", "sports"})

for key, value, category in OSM_TAG_TO_CATEGORY:
    bucket = (
        _KEY_VALUES_PRIORITY
        if category in _PRIORITY_CATEGORIES or key in ("historic", "natural", "landuse")
        else _KEY_VALUES_GENERAL
    )
    bucket.setdefault(key, []).append(value)
_KEY_VALUES_GENERAL.setdefault("shop", []).append("mall")

_CATEGORY_ORDER = (
    "nature",
    "culture",
    "family",
    "sports",
    "markets",
    "food",
    "music",
    "festival",
)


def _build_query(
    lat: float,
    lon: float,
    key_values: dict[str, list[str]],
    *,
    radius: int,
    output_cap: int,
) -> str:
    parts = []
    for key, values in key_values.items():
        if not values:
            continue
        regex = "|".join(sorted(set(values)))
        parts.append(
            f'  nwr["{key}"~"^({regex})$"]["name"](around:{radius},{lat},{lon});'
        )
    if not parts:
        return ""
    body = "\n".join(parts)
    return f"[out:json][timeout:20];\n(\n{body}\n);\nout center {output_cap};"


def _element_name(tags: dict[str, str], *, lang: str = "en") -> str | None:
    """Resolve a display name from OSM tags (incl. localized names)."""
    prefer = "fr" if lang == "fr" else "en"
    for key in (
        f"name:{prefer}",
        "name",
        "name:en",
        "name:fr",
        "alt_name",
        "official_name",
    ):
        value = tags.get(key)
        if value and str(value).strip():
            return str(value).strip()
    return None


def _categorise(tags: dict[str, str]) -> str | None:
    for key, value, category in OSM_TAG_TO_CATEGORY:
        if tags.get(key) == value:
            return category
    if tags.get("shop") == "mall":
        return "markets"
    return None


def _coords(element: dict) -> tuple[float | None, float | None]:
    if "lat" in element and "lon" in element:
        return element["lat"], element["lon"]
    center = element.get("center")
    if center:
        return center.get("lat"), center.get("lon")
    return None, None


def _make_id(prefix: str, value: str) -> str:
    digest = hashlib.sha1(value.encode("utf-8")).hexdigest()[:12]
    return f"{prefix}-{digest}"


def _category_rank(category: str) -> int:
    try:
        return _CATEGORY_ORDER.index(category)
    except ValueError:
        return len(_CATEGORY_ORDER)


async def _run_overpass_queries(lat: float, lon: float) -> list[dict]:
    radius = settings.ACTIVITIES_RADIUS_METERS
    priority_q = _build_query(
        lat,
        lon,
        _KEY_VALUES_PRIORITY,
        radius=radius,
        output_cap=settings.ACTIVITIES_OVERPASS_PRIORITY_OUTPUT,
    )
    general_q = _build_query(
        lat,
        lon,
        _KEY_VALUES_GENERAL,
        radius=radius,
        output_cap=settings.ACTIVITIES_OVERPASS_GENERAL_OUTPUT,
    )
    tasks = []
    if priority_q:
        tasks.append(run_overpass(priority_q))
    if general_q:
        tasks.append(run_overpass(general_q))
    if not tasks:
        return []

    results = await asyncio.gather(*tasks, return_exceptions=True)
    elements: list[dict] = []
    seen_ids: set[tuple[str, int]] = set()
    for result in results:
        if isinstance(result, BaseException):
            continue
        for element in result.get("elements", []):
            eid = (element.get("type", "node"), element.get("id"))
            if eid in seen_ids:
                continue
            seen_ids.add(eid)
            elements.append(element)

    if not elements:
        errors = [r for r in results if isinstance(r, BaseException)]
        if errors:
            raise errors[0]
    return elements


async def get_activities(
    place: Place, limit: int = 120, *, lang: str = "en"
) -> list[Item]:
    """Fetch activities for a place.

    Raises ProviderError if every Overpass mirror is unavailable, so the caller
    can tell the difference between "service busy" and "genuinely nothing here".
    """
    elements = await _run_overpass_queries(place.latitude, place.longitude)

    by_category: dict[str, list[Item]] = {}
    seen: set[str] = set()
    for element in elements:
        tags = element.get("tags") or {}
        name = _element_name(tags, lang=lang)
        if not name:
            continue
        category = _categorise(tags)
        if not category:
            continue

        osm_type = element.get("type", "node")
        osm_id = element.get("id")
        osm_url = f"https://www.openstreetmap.org/{osm_type}/{osm_id}"

        website = tags.get("website") or tags.get("contact:website")
        if website and website.startswith("http"):
            source_name = "Official website"
            source_url = website
        else:
            source_name = "OpenStreetMap"
            source_url = osm_url

        dedup_key = f"{name.lower()}|{category}"
        if dedup_key in seen:
            continue
        seen.add(dedup_key)

        lat, lon = _coords(element)
        descriptor = category_label(category)
        extra = tags.get("description") or tags.get("tourism") or tags.get("leisure")
        description = f"{descriptor}" + (f" \u00b7 {extra}" if extra else "")

        item_tags = [category]
        if tags.get("opening_hours"):
            item_tags.append("has hours")
        if website:
            item_tags.append("website")

        by_category.setdefault(category, []).append(
            Item(
                id=_make_id("act", osm_url),
                kind="activity",
                title=name,
                category=category,
                keyword=resolve_keyword(category=category, kind="activity", osm_tags=tags),
                description=description,
                location_name=tags.get("addr:street") or place.name,
                latitude=lat,
                longitude=lon,
                is_outdoor=category in OUTDOOR_CATEGORIES,
                source_name=source_name,
                source_url=source_url,
                tags=item_tags,
            )
        )

    ordered_cats = sorted(by_category.keys(), key=_category_rank)
    items: list[Item] = []
    cursors = {cat: 0 for cat in ordered_cats}
    while len(items) < limit:
        progressed = False
        for cat in ordered_cats:
            bucket = by_category[cat]
            idx = cursors[cat]
            if idx < len(bucket):
                items.append(bucket[idx])
                cursors[cat] += 1
                progressed = True
                if len(items) >= limit:
                    break
        if not progressed:
            break

    return items
