"""Server-side discover filtering and pagination from the full cached result."""
from __future__ import annotations

import unicodedata
from datetime import date, timedelta

from app.i18n import category_label, normalize_lang
from app.models import DiscoverPagination, DiscoverResponse, Item


def sorted_events(events: list[Item]) -> list[Item]:
    return sorted(
        events,
        key=lambda i: (
            i.end or i.start or "9999-12-31",
            i.start or "",
            i.title.lower(),
        ),
    )


def normalize_filter_dates(
    date_from: str | None, date_to: str | None
) -> tuple[str | None, str | None]:
    """Parse and order YYYY-MM-DD filter bounds."""
    start = end = None
    if date_from:
        try:
            start = date.fromisoformat(date_from[:10]).isoformat()
        except ValueError:
            start = None
    if date_to:
        try:
            end = date.fromisoformat(date_to[:10]).isoformat()
        except ValueError:
            end = None
    if start and end and start > end:
        start, end = end, start
    return start, end


def _parse_client_today(value: str | None) -> date:
    if value:
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            pass
    return date.today()


def _normalize_search_text(value: str) -> str:
    text = unicodedata.normalize("NFD", (value or "").lower())
    return "".join(c for c in text if unicodedata.category(c) != "Mn")


def _iso_date_only(value: str | None) -> str | None:
    if not value:
        return None
    return value[:10] if len(value) >= 10 else value


def _add_days_iso(day_iso: str, days: int) -> str:
    return (date.fromisoformat(day_iso) + timedelta(days=days)).isoformat()


def _start_of_week(ref: date) -> date:
    return ref - timedelta(days=ref.weekday())


def _event_matches_date_range(item: Item, date_from: str, date_to: str) -> bool:
    if item.kind != "event" or not item.start:
        return False
    start_iso = _iso_date_only(item.start)
    end_iso = _iso_date_only(item.end or item.start)
    if not start_iso or not end_iso:
        return False
    ev_start = date.fromisoformat(start_iso)
    ev_end = date.fromisoformat(end_iso)
    range_start = date.fromisoformat(date_from)
    range_end = date.fromisoformat(date_to)
    return ev_start <= range_end and ev_end >= range_start


def _event_matches_period(item: Item, period: str, today: date) -> bool:
    if item.kind != "event" or not item.start:
        return False
    today_iso = today.isoformat()
    start_iso = _iso_date_only(item.start)
    end_iso = _iso_date_only(item.end or item.start)
    if not start_iso or not end_iso:
        return False

    if period == "today":
        return start_iso == end_iso == today_iso
    if period == "hot_week":
        last = _add_days_iso(today_iso, 6)
        return end_iso >= today_iso and end_iso <= last
    if period == "week":
        week_start = _start_of_week(today)
        week_end = week_start + timedelta(days=6)
        ev_start = date.fromisoformat(start_iso)
        ev_end = date.fromisoformat(end_iso)
        return ev_start <= week_end and ev_end >= week_start
    if period == "month":
        month_start = today.replace(day=1)
        if today.month == 12:
            month_end = today.replace(year=today.year + 1, month=1, day=1) - timedelta(days=1)
        else:
            month_end = today.replace(month=today.month + 1, day=1) - timedelta(days=1)
        ev_start = date.fromisoformat(start_iso)
        ev_end = date.fromisoformat(end_iso)
        return ev_start <= month_end and ev_end >= month_start
    if period == "quarter":
        quarter_end = today + timedelta(days=90)
        ev_start = date.fromisoformat(start_iso)
        ev_end = date.fromisoformat(end_iso)
        return ev_start <= quarter_end and ev_end >= today
    return True


def _item_matches_keyword(item: Item, query: str, lang: str) -> bool:
    terms = [term for term in _normalize_search_text(query).split() if term]
    if not terms:
        return True
    lng = normalize_lang(lang)
    meta_label = category_label(item.category, lng)
    hay = _normalize_search_text(
        " ".join(
            part
            for part in [
                item.title,
                item.description,
                item.keyword,
                item.location_name,
                meta_label,
                "event",
                "activity",
                "événement",
                "activité",
                *(item.tags or []),
            ]
            if part
        )
    )
    return all(term in hay for term in terms)


def item_matches_discover_filters(
    item: Item,
    *,
    kind: str,
    category: str | None,
    item_kind: str | None,
    outdoor_only: bool,
    event_period: str | None,
    date_from: str | None,
    date_to: str | None,
    keyword: str | None,
    openagenda_only: bool,
    client_today: date,
    lang: str,
) -> bool:
    if category and item.category != category:
        return False
    if item_kind == "event" and kind != "event":
        return False
    if item_kind == "activity" and kind != "activity":
        return False
    if outdoor_only and not item.is_outdoor:
        return False
    if openagenda_only and kind == "event" and "openagenda" not in (item.tags or []):
        return False
    if kind == "event":
        if date_from and date_to:
            if not _event_matches_date_range(item, date_from, date_to):
                return False
        elif event_period and event_period != "all":
            if not _event_matches_period(item, event_period, client_today):
                return False
    if keyword and keyword.strip() and not _item_matches_keyword(item, keyword, lang):
        return False
    return True


def filtered_discover_items(
    full: DiscoverResponse,
    *,
    category: str | None = None,
    item_kind: str | None = None,
    outdoor_only: bool = False,
    event_period: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    keyword: str | None = None,
    openagenda_only: bool = False,
    client_today: str | None = None,
    lang: str = "en",
) -> list[tuple[str, Item]]:
    today = _parse_client_today(client_today)
    merged: list[tuple[str, Item]] = []
    for activity in full.activities:
        if item_matches_discover_filters(
            activity,
            kind="activity",
            category=category,
            item_kind=item_kind,
            outdoor_only=outdoor_only,
            event_period=event_period,
            date_from=date_from,
            date_to=date_to,
            keyword=keyword,
            openagenda_only=openagenda_only,
            client_today=today,
            lang=lang,
        ):
            merged.append(("activity", activity))
    for event in sorted_events(full.events):
        if item_matches_discover_filters(
            event,
            kind="event",
            category=category,
            item_kind=item_kind,
            outdoor_only=outdoor_only,
            event_period=event_period,
            date_from=date_from,
            date_to=date_to,
            keyword=keyword,
            openagenda_only=openagenda_only,
            client_today=today,
            lang=lang,
        ):
            merged.append(("event", event))
    return merged


def paginate_discover_filtered(
    full: DiscoverResponse,
    offset: int,
    limit: int,
    *,
    category: str | None = None,
    item_kind: str | None = None,
    outdoor_only: bool = False,
    event_period: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    keyword: str | None = None,
    openagenda_only: bool = False,
    client_today: str | None = None,
    lang: str = "en",
) -> DiscoverResponse:
    """Return a page of activities and events that match the active filters."""
    merged = filtered_discover_items(
        full,
        category=category,
        item_kind=item_kind,
        outdoor_only=outdoor_only,
        event_period=event_period,
        date_from=date_from,
        date_to=date_to,
        keyword=keyword,
        openagenda_only=openagenda_only,
        client_today=client_today,
        lang=lang,
    )
    total = len(merged)
    page = merged[offset : offset + limit]
    page_activities = [item for kind, item in page if kind == "activity"]
    page_events = [item for kind, item in page if kind == "event"]
    returned = len(page)
    return DiscoverResponse(
        place=full.place,
        weather=full.weather,
        activities=page_activities,
        events=page_events,
        notices=full.notices if offset == 0 else [],
        pagination=DiscoverPagination(
            offset=offset,
            limit=limit,
            total=total,
            returned=returned,
            has_more=offset + returned < total,
        ),
    )
