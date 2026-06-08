"""Time-bound events for the next weeks.

Two sources:
  1. A curated dataset of real Nantes venues/highlights (keyless, always works).
     Dates are generated relative to today so the demo is always "upcoming".
  2. OpenAgenda (optional) for live events in any city when an API key is set.

Both fail soft and always return clickable source URLs.
"""
from __future__ import annotations

import hashlib
import json
import unicodedata
from datetime import date, timedelta
from pathlib import Path

from app.categories import category_keyword, is_known_category
from app.config import settings
from app.i18n import normalize_lang, notice_curated_highlights, notice_no_event_feed
from app.models import Item, Place
from app.providers.http import build_client

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def _make_id(value: str) -> str:
    return "evt-" + hashlib.sha1(value.encode("utf-8")).hexdigest()[:12]


def _city_file_key(name: str) -> str:
    """Normalize a geocoded city name to a curated JSON filename stem."""
    key = name.strip().lower()
    key = unicodedata.normalize("NFD", key)
    key = "".join(c for c in key if unicodedata.category(c) != "Mn")
    return key.replace(" ", "-")


def _load_curated(city_key: str) -> dict | None:
    path = _DATA_DIR / f"{_city_file_key(city_key)}_events.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _curated_events(place: Place) -> list[Item]:
    dataset = _load_curated(place.name)
    if not dataset:
        return []

    today = date.today()
    horizon = today + timedelta(days=settings.EVENT_HORIZON_DAYS)
    items: list[Item] = []
    for raw in dataset.get("events", []):
        start_date = today + timedelta(days=int(raw.get("day_offset", 0)))
        if start_date > horizon:
            continue
        duration = max(1, int(raw.get("duration_days", 1)))
        end_date = start_date + timedelta(days=duration - 1)
        category = raw.get("category", "culture")
        if not is_known_category(category):
            category = "culture"
        items.append(
            Item(
                id=_make_id(raw["title"]),
                kind="event",
                title=raw["title"],
                category=category,
                keyword=raw.get("keyword") or category_keyword(category, kind="event"),
                description=raw.get("description"),
                location_name=raw.get("venue"),
                latitude=raw.get("latitude"),
                longitude=raw.get("longitude"),
                start=start_date.isoformat(),
                end=end_date.isoformat(),
                is_outdoor=bool(raw.get("is_outdoor", False)),
                source_name=raw.get("source_name", "Official website"),
                source_url=raw["source_url"],
                tags=[category, "curated"],
            )
        )
    items.sort(key=lambda i: i.start or "")
    return items


# --- OpenAgenda (optional, keyed) ----------------------------------------

_OA_CATEGORY_HINTS = {
    "concert": "music",
    "musique": "music",
    "music": "music",
    "expo": "culture",
    "exposition": "culture",
    "th\u00e9\u00e2tre": "culture",
    "theatre": "culture",
    "cin\u00e9ma": "culture",
    "art": "culture",
    "sport": "sports",
    "nature": "nature",
    "balade": "nature",
    "march\u00e9": "markets",
    "festival": "festival",
    "famille": "family",
    "enfant": "family",
    "gastronomie": "food",
    "food": "food",
}


def _guess_category(keywords: list[str]) -> str:
    for kw in keywords:
        low = kw.lower()
        for hint, cat in _OA_CATEGORY_HINTS.items():
            if hint in low:
                return cat
    return "culture"


def _lang_preference(lang: str) -> tuple[str, ...]:
    lng = normalize_lang(lang)
    return (lng, "en", "fr") if lng == "fr" else ("en", "fr")


async def _openagenda_events(
    place: Place, *, openagenda_key: str | None = None, lang: str = "en"
) -> list[Item]:
    key = (openagenda_key or "").strip() or settings.OPENAGENDA_KEY
    if not key:
        return []
    try:
        async with build_client() as client:
            # 1. Find an agenda matching the city.
            agendas = await client.get(
                "https://api.openagenda.com/v2/agendas",
                params={"key": key, "search": place.name, "size": 1},
            )
            agendas.raise_for_status()
            results = agendas.json().get("agendas") or []
            if not results:
                return []
            uid = results[0].get("uid")

            # 2. Fetch current + upcoming events from that agenda.
            evresp = await client.get(
                f"https://api.openagenda.com/v2/agendas/{uid}/events",
                params={
                    "key": key,
                    "relative[]": ["current", "upcoming"],
                    "size": 60,
                    "detailed": 1,
                },
            )
            evresp.raise_for_status()
            events = evresp.json().get("events") or []
    except Exception:
        return []

    prefer = _lang_preference(lang)
    items: list[Item] = []
    for ev in events:
        title = _pick_lang(ev.get("title"), prefer=prefer)
        if not title:
            continue
        keywords = ev.get("keywords", {})
        kw_list = _pick_lang(keywords, prefer=prefer) if isinstance(keywords, dict) else []
        category = _guess_category(kw_list if isinstance(kw_list, list) else [])
        timings = ev.get("timings") or []
        start = timings[0]["begin"][:10] if timings else None
        end = timings[-1]["end"][:10] if timings else None
        location = ev.get("location") or {}
        slug = ev.get("slug") or ev.get("uid")
        source_url = (
            ev.get("originAgenda", {}).get("url")
            or f"https://openagenda.com/{slug}"
        )
        items.append(
            Item(
                id=_make_id(f"oa-{ev.get('uid')}"),
                kind="event",
                title=title,
                category=category,
                keyword=category_keyword(category, kind="event"),
                description=_pick_lang(ev.get("description"), prefer=prefer),
                image_url=(ev.get("image") or {}).get("base"),
                location_name=location.get("name") or place.name,
                latitude=location.get("latitude"),
                longitude=location.get("longitude"),
                start=start,
                end=end,
                is_outdoor=category in {"nature", "sports", "markets"},
                source_name="OpenAgenda",
                source_url=source_url,
                tags=[category, "openagenda"],
            )
        )
    items.sort(key=lambda i: i.start or "")
    return items


def _pick_lang(value, prefer=("en", "fr")):
    """OpenAgenda returns multilingual dicts. Pick a sensible language."""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for lang in prefer:
            if value.get(lang):
                return value[lang]
        for v in value.values():
            if v:
                return v
    if isinstance(value, list):
        return value
    return None


def _has_openagenda_key(openagenda_key: str | None = None) -> bool:
    return bool((openagenda_key or "").strip() or settings.OPENAGENDA_KEY)


async def get_events(
    place: Place, *, openagenda_key: str | None = None, lang: str = "en"
) -> tuple[list[Item], list[str]]:
    """Return (events, notices)."""
    notices: list[str] = []

    live = await _openagenda_events(place, openagenda_key=openagenda_key, lang=lang)
    if live:
        return live, notices

    curated = _curated_events(place)
    if curated:
        if not _has_openagenda_key(openagenda_key):
            notices.append(notice_curated_highlights(lang))
        return curated, notices

    notices.append(notice_no_event_feed(place.name, lang))
    return [], notices
