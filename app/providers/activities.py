"""Discover permanent "things to do" around a city via OpenStreetMap Overpass.

Keyless and global. Returns parks, museums, viewpoints, sports venues, etc.
Each item links back to its OpenStreetMap object (or official website when known)
so the user always has a clickable source.
"""
from __future__ import annotations

import hashlib

from app.categories import (
    OSM_TAG_TO_CATEGORY,
    OUTDOOR_CATEGORIES,
    category_label,
    resolve_keyword,
)
from app.models import Item, Place
from app.providers.http import run_overpass

# Build the regex value lists per OSM key from the taxonomy mapping.
_KEY_VALUES: dict[str, list[str]] = {}
for key, value, _cat in OSM_TAG_TO_CATEGORY:
    _KEY_VALUES.setdefault(key, []).append(value)
# Also surface malls (markets).
_KEY_VALUES.setdefault("shop", []).append("mall")


def _build_query(lat: float, lon: float, radius: int = 7000) -> str:
    parts = []
    for key, values in _KEY_VALUES.items():
        regex = "|".join(sorted(set(values)))
        parts.append(
            f'  nwr["{key}"~"^({regex})$"]["name"](around:{radius},{lat},{lon});'
        )
    body = "\n".join(parts)
    # A higher output cap captures area features (parks, gardens, museums) that
    # OSM returns after point POIs such as bars and cafes.
    return f"[out:json][timeout:18];\n(\n{body}\n);\nout center 800;"


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


async def get_activities(place: Place, limit: int = 120) -> list[Item]:
    """Fetch activities for a place.

    Raises ProviderError if every Overpass mirror is unavailable, so the caller
    can tell the difference between "service busy" and "genuinely nothing here".
    """
    query = _build_query(place.latitude, place.longitude)
    data = await run_overpass(query)  # raises ProviderError on total failure

    # Group by category first so we can balance the final selection. OSM returns
    # nodes (bars/cafes) before ways/relations (parks/museums), so a naive cap
    # would crowd out outdoor and cultural spots.
    by_category: dict[str, list[Item]] = {}
    seen: set[str] = set()
    for element in data.get("elements", []):
        tags = element.get("tags") or {}
        name = tags.get("name")
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

    # Round-robin across categories so every filter has something to show, while
    # still respecting the overall limit.
    items: list[Item] = []
    cursors = {cat: 0 for cat in by_category}
    while len(items) < limit:
        progressed = False
        for cat, bucket in by_category.items():
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
