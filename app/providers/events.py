"""Time-bound events for the next weeks.

Two sources:
  1. A curated dataset of real Nantes venues/highlights (keyless, always works).
     Dates are generated relative to today so the demo is always "upcoming".
  2. OpenAgenda (optional) for live events in any city when an API key is set.

Both fail soft and always return clickable source URLs.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import math
import re
import unicodedata
from datetime import date, timedelta
from pathlib import Path

from app.categories import category_keyword, is_known_category
from app.config import settings
from app.i18n import (
    normalize_lang,
    notice_curated_highlights,
    notice_no_event_feed,
    notice_live_events_only_empty,
    notice_live_events_only_no_key,
    notice_openagenda_auth_failed,
    notice_openagenda_fallback,
    notice_openagenda_no_results,
)
from app.models import Item, Place
from app.providers.http import build_client

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
logger = logging.getLogger("citychilly")

_POSTCODE_DISPLAY_RE = re.compile(r"^\d{4,6}\s*·\s*(.+)$", re.UNICODE)
_OA_BASE_URL = "https://api.openagenda.com/v2"
_OA_MAX_AGENDAS = 30
_OA_MAX_EVENTS = 80
_OA_FETCH_CONCURRENCY = 8


class OpenAgendaAuthError(Exception):
    """Raised when OpenAgenda rejects the API key."""


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


_FR_OVERLAYS: dict | None = None


def _load_fr_overlays() -> dict[str, dict[str, str]]:
    global _FR_OVERLAYS
    if _FR_OVERLAYS is None:
        path = _DATA_DIR / "curated_fr.json"
        if path.exists():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                _FR_OVERLAYS = data.get("by_title", {}) if isinstance(data, dict) else {}
            except Exception:
                _FR_OVERLAYS = {}
        else:
            _FR_OVERLAYS = {}
    return _FR_OVERLAYS


def _localized_curated(raw: dict, field: str, lang: str) -> str | None:
    """Resolve a curated event text field for the requested language."""
    lng = normalize_lang(lang)
    prefer = _lang_preference(lang)
    value = raw.get(field)
    fr_field = f"{field}_fr"

    if isinstance(value, dict):
        return _pick_lang(value, prefer=prefer)

    if lng == "fr":
        if raw.get(fr_field):
            return raw[fr_field]
        en_title = raw.get("title")
        if isinstance(en_title, dict):
            en_title = _pick_lang(en_title, prefer=("en", "fr"))
        overlay = _load_fr_overlays().get(en_title or "", {})
        if overlay.get(field):
            return overlay[field]

    return value if isinstance(value, str) else None


def _extract_city_name(display: str) -> str:
    """Strip a postcode prefix from display names like '44100 · Nantes'."""
    display = (display or "").strip()
    if " · " in display:
        left, right = display.split(" · ", 1)
        if left.strip().isdigit() and 4 <= len(left.strip()) <= 6:
            return right.strip()
    match = _POSTCODE_DISPLAY_RE.match(display)
    if match:
        return match.group(1).strip()
    return display


def _city_for_events(place: Place, city_name: str | None = None) -> str:
    if city_name and city_name.strip():
        return city_name.strip()
    return _extract_city_name(place.name)


def _city_name_variants(city: str) -> list[str]:
    """OpenAgenda city filters may differ on accents or punctuation."""
    variants: list[str] = []
    seen: set[str] = set()
    for candidate in (city, city.replace("-", " ")):
        folded = unicodedata.normalize("NFD", candidate)
        ascii_name = "".join(c for c in folded if unicodedata.category(c) != "Mn")
        for value in (candidate, ascii_name):
            key = value.strip().lower()
            if value.strip() and key not in seen:
                seen.add(key)
                variants.append(value.strip())
    return variants


def _oa_search_terms(city: str, place: Place) -> list[str]:
    terms: list[str] = []
    seen: set[str] = set()
    for candidate in [
        city,
        *(_city_name_variants(city)),
        f"{city} {place.admin2}" if place.admin2 else None,
        place.admin2,
        place.admin3 if place.admin3 and place.admin3.lower() != city.lower() else None,
    ]:
        if not candidate:
            continue
        key = candidate.strip().lower()
        if key and key not in seen:
            seen.add(key)
            terms.append(candidate.strip())
    return terms


def _curated_events(
    place: Place, *, lang: str = "en", city_key: str | None = None
) -> list[Item]:
    dataset = _load_curated(city_key or _extract_city_name(place.name))
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
        title_en = raw["title"] if isinstance(raw["title"], str) else _pick_lang(
            raw["title"], prefer=("en", "fr")
        )
        title = _localized_curated(raw, "title", lang) or title_en
        keyword = (
            _localized_curated(raw, "keyword", lang)
            or raw.get("keyword")
            or category_keyword(category, kind="event")
        )
        items.append(
            Item(
                id=_make_id(title_en or title or ""),
                kind="event",
                title=title or title_en or "",
                category=category,
                keyword=keyword,
                description=_localized_curated(raw, "description", lang),
                location_name=_localized_curated(raw, "venue", lang) or raw.get("venue"),
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


def _oa_headers(key: str) -> dict[str, str]:
    return {"key": key}


def _oa_event_params(lang: str, *, city: str | None = None, lat: float | None = None, lon: float | None = None) -> list[tuple[str, str]]:
    params: list[tuple[str, str]] = [
        ("size", "80"),
        ("detailed", "1"),
        ("monolingual", normalize_lang(lang)),
        ("relative[]", "current"),
        ("relative[]", "upcoming"),
    ]
    if city:
        params.append(("adminLevel4[]", city))
    if lat is not None and lon is not None:
        lat_delta = 40.0 / 111.0
        lon_delta = 40.0 / (111.0 * max(math.cos(math.radians(lat)), 0.2))
        params.extend(
            [
                ("geo[northEast][lat]", f"{lat + lat_delta:.6f}"),
                ("geo[northEast][lng]", f"{lon + lon_delta:.6f}"),
                ("geo[southWest][lat]", f"{lat - lat_delta:.6f}"),
                ("geo[southWest][lng]", f"{lon - lon_delta:.6f}"),
            ]
        )
    return params


def _is_rejected_api_key(resp) -> bool:
    """True only when OpenAgenda rejects the key itself (not feature-gated endpoints)."""
    if resp.status_code != 403:
        return False
    try:
        body = resp.json()
        msg = str(body.get("message") or body.get("error") or "").lower()
    except Exception:
        return False
    return "matching key" in msg


async def _oa_get_json(
    client,
    path: str,
    key: str,
    params: list[tuple[str, str]],
) -> dict:
    resp = await client.get(
        f"{_OA_BASE_URL}{path}",
        headers=_oa_headers(key),
        params=params,
    )
    if _is_rejected_api_key(resp):
        raise OpenAgendaAuthError()
    if resp.status_code >= 400:
        logger.warning(
            "OpenAgenda %s returned HTTP %s: %s",
            path,
            resp.status_code,
            resp.text[:200],
        )
        return {}
    try:
        return resp.json()
    except Exception as exc:
        logger.warning("OpenAgenda %s returned invalid JSON: %s", path, exc)
        return {}


async def _find_agenda_uids(
    client, key: str, city: str, *, place: Place
) -> list[int]:
    uids: list[int] = []
    for term in _oa_search_terms(city, place):
        for official in ("1", None):
            params: list[tuple[str, str]] = [
                ("search", term),
                ("size", str(_OA_MAX_AGENDAS)),
            ]
            if official:
                params.append(("official", official))
            payload = await _oa_get_json(client, "/agendas", key, params)
            for agenda in payload.get("agendas") or []:
                uid = agenda.get("uid")
                if uid is not None and uid not in uids:
                    uids.append(uid)
            if len(uids) >= _OA_MAX_AGENDAS:
                return uids[:_OA_MAX_AGENDAS]
        if uids:
            break
    return uids


async def _fetch_openagenda_raw(
    client,
    key: str,
    place: Place,
    city: str,
    lang: str,
) -> list[dict]:
    lat, lon = place.latitude, place.longitude
    seen: set[int] = set()
    collected: list[dict] = []

    def _merge(events: list[dict]) -> None:
        nonlocal collected
        for ev in events:
            uid = ev.get("uid")
            if uid is None or uid in seen:
                continue
            seen.add(uid)
            collected.append(ev)
            if len(collected) >= _OA_MAX_EVENTS:
                return

    uids = await _find_agenda_uids(client, key, city, place=place)
    if not uids:
        return collected

    sem = asyncio.Semaphore(_OA_FETCH_CONCURRENCY)

    async def _events_for(uid: int, params: list[tuple[str, str]]) -> list[dict]:
        async with sem:
            payload = await _oa_get_json(
                client, f"/agendas/{uid}/events", key, params
            )
            return payload.get("events") or []

    # Phase 1: geo around the pin — most reliable for local events.
    geo_params = _oa_event_params(lang, lat=lat, lon=lon)
    geo_batches = await asyncio.gather(
        *[_events_for(uid, geo_params) for uid in uids],
        return_exceptions=True,
    )
    for batch in geo_batches:
        if isinstance(batch, BaseException):
            logger.warning("OpenAgenda agenda fetch failed: %s", batch)
            continue
        _merge(batch)
        if len(collected) >= _OA_MAX_EVENTS:
            return collected

    if collected:
        return collected

    # Phase 2: city-name filters for agendas that geo alone missed.
    for variant in _city_name_variants(city):
        for uid in uids:
            for params in (
                _oa_event_params(lang, city=variant, lat=lat, lon=lon),
                _oa_event_params(lang, city=variant),
            ):
                _merge(await _events_for(uid, params))
                if len(collected) >= _OA_MAX_EVENTS:
                    return collected

    # Optional cross-agenda index — most API keys lack access (HTTP 403).
    for params in (
        _oa_event_params(lang, city=city, lat=lat, lon=lon),
        _oa_event_params(lang, lat=lat, lon=lon),
        _oa_event_params(lang, city=city),
    ):
        payload = await _oa_get_json(client, "/events", key, params)
        _merge(payload.get("events") or [])
        if collected:
            return collected

    return collected


def _oa_events_to_items(events: list[dict], place: Place, lang: str) -> list[Item]:
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
                location_name=location.get("name") or _extract_city_name(place.name),
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


async def _openagenda_events(
    place: Place,
    *,
    openagenda_key: str | None = None,
    lang: str = "en",
    city_name: str | None = None,
) -> tuple[list[Item], str | None]:
    """Return (events, status). status is 'auth', 'empty', or None on success."""
    key = _resolve_openagenda_key(openagenda_key)
    if not key:
        return [], None

    city = _city_for_events(place, city_name)
    try:
        async with build_client() as client:
            raw = await _fetch_openagenda_raw(client, key, place, city, lang)
    except OpenAgendaAuthError:
        return [], "auth"
    except Exception as exc:
        logger.warning("OpenAgenda fetch failed for %s: %s", city, exc)
        return [], "empty"

    items = _oa_events_to_items(raw, place, lang)
    if items:
        return items, None
    return [], "empty"


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
    return _resolve_openagenda_key(openagenda_key) is not None


def _resolve_openagenda_key(openagenda_key: str | None = None) -> str | None:
    client = (openagenda_key or "").strip() or None
    if client:
        return client
    server = (settings.OPENAGENDA_KEY or "").strip() or None
    return server


async def verify_openagenda_key(openagenda_key: str | None = None) -> dict[str, bool]:
    """Check that the configured OpenAgenda key is accepted by their API."""
    key = _resolve_openagenda_key(openagenda_key)
    if not key:
        return {"configured": False, "valid": False}

    try:
        async with build_client(timeout=10) as client:
            resp = await client.get(
                f"{_OA_BASE_URL}/agendas",
                headers=_oa_headers(key),
                params=[("size", "1")],
            )
            if _is_rejected_api_key(resp):
                return {"configured": True, "valid": False}
            if resp.status_code >= 400:
                logger.warning(
                    "OpenAgenda key check returned HTTP %s", resp.status_code
                )
                return {"configured": True, "valid": False}
            return {"configured": True, "valid": True}
    except Exception as exc:
        logger.warning("OpenAgenda key verification failed: %s", exc)
        return {"configured": True, "valid": False}


async def get_events(
    place: Place,
    *,
    openagenda_key: str | None = None,
    lang: str = "en",
    city_name: str | None = None,
    live_only: bool = False,
) -> tuple[list[Item], list[str]]:
    """Return (events, notices)."""
    notices: list[str] = []
    city = _city_for_events(place, city_name)
    has_key = _has_openagenda_key(openagenda_key)

    live, oa_status = await _openagenda_events(
        place,
        openagenda_key=openagenda_key,
        lang=lang,
        city_name=city,
    )

    if live_only:
        if live:
            return live, notices
        if not has_key:
            notices.append(notice_live_events_only_no_key(lang))
        elif oa_status == "auth":
            notices.append(notice_openagenda_auth_failed(lang))
        else:
            notices.append(notice_live_events_only_empty(city, lang))
        return [], notices

    curated = _curated_events(place, lang=lang, city_key=city)

    seen_ids: set[str] = set()
    merged: list[Item] = []
    for item in live + curated:
        if item.id in seen_ids:
            continue
        seen_ids.add(item.id)
        merged.append(item)
    merged.sort(key=lambda i: i.start or "")

    if live and curated:
        pass
    elif has_key:
        if oa_status == "auth":
            notices.append(notice_openagenda_auth_failed(lang))
        elif not live and curated:
            notices.append(notice_openagenda_fallback(city, lang))
        elif not live and not curated:
            notices.append(notice_openagenda_no_results(city, lang))
    elif curated:
        notices.append(notice_curated_highlights(lang))

    if merged:
        return merged, notices

    if not has_key:
        notices.append(notice_no_event_feed(city, lang))
    return [], notices
