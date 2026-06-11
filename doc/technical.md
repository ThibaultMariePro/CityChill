# CityChilly — Technical Overview

This document explains how CityChilly is built, the technology choices behind it,
and how the pieces fit together.

> **Maintainers:** update this file (and `setup_guide.md` / `CityChilly.md`)
> whenever behaviour or APIs change — especially after new features or bug fixes.

---

## 1. High-level architecture

CityChilly is a single deployable unit: a **FastAPI** backend that also serves a
**static, build-free web UI**. There is no separate frontend server and no
database — which makes it trivial to dockerize and expose on the internet.

```
                ┌──────────────────────────────────────────────┐
                │                Browser (SPA)                  │
                │  index.html · styles.css · app.js · i18n.js   │
                │  localStorage: favorites, agenda, theme, keys │
                │  lazy API bootstrap on first user action    │
                └───────────────┬──────────────────────────────┘
                                │  fetch /api/*
                                ▼
                ┌──────────────────────────────────────────────┐
                │              FastAPI (app/main.py)            │
                │  /api/discover  /api/geocode  /api/health  …   │
                │  + serves the static web UI                   │
                │  in-memory TTL cache (app/cache.py)           │
                └───────┬───────────┬───────────┬──────────────┘
                        │           │           │
            geocode.py  │  weather.py│ activities.py / events.py
                        ▼           ▼           ▼
              Open-Meteo     Open-Meteo    OpenStreetMap (Overpass)
              Geocoding       Forecast      + curated datasets (20 cities)
                                            + OpenAgenda (optional)
```

### Why this shape?

- **One container, no build step.** The UI is plain HTML/CSS/JS served by
  FastAPI, so the Docker image is a single small Python image. No Node, no
  bundler, no `npm install` to break.
- **Stateless backend.** All user state (favorites, agenda, theme, optional
  browser keys) lives in the browser. The server only aggregates public data, so
  it scales horizontally and needs no database.
- **Fail-soft providers.** Each data source is isolated and degrades gracefully:
  if Overpass or OpenAgenda is briefly unavailable, the rest of the app keeps
  working and the UI shows a friendly notice.
- **Lazy frontend bootstrap.** On first paint the UI makes **no API calls** — no
  geocode, discover, health, theme, or categories fetch. `ensureApiBootstrap()`
  in `web/app.js` runs on the first search, autocomplete request, Parameters tab
  visit, or header/main interaction.

---

## 2. Tech stack

### Backend
- **Python 3.12**
- **FastAPI** — API framework + automatic OpenAPI docs at `/docs`.
- **Uvicorn** — ASGI server.
- **httpx** — async HTTP client used to call upstream APIs concurrently.
- **Pydantic v2** — response models / validation (`app/models.py`).
- **python-dotenv** — load configuration from `.env`.

### Frontend
- **Vanilla JavaScript** (no framework, no build) — `web/app.js`.
- **i18n** — `web/i18n.js` (English / French).
- **Modern CSS** with custom properties for theming — `web/styles.css`.
- **Google Fonts**: *Fraunces* (display) + *Inter* (body).
- **localStorage** for favorites, agenda, theme, language, filters, optional
  API keys, and pinned postal codes.

### Tooling / ops
- **Docker** + **docker compose** for packaging and deployment.
- Container **HEALTHCHECK** hitting `/api/health`.

---

## 3. External data sources

| Provider | Module | Key required? | Purpose |
|----------|--------|---------------|---------|
| Open-Meteo Geocoding | `app/providers/geocode.py` | No | City / postal code → coordinates + suggestions |
| Open-Meteo Forecast | `app/providers/weather.py` | No | Up to 16-day daily forecast |
| OpenStreetMap Overpass | `app/providers/activities.py` | No | Permanent activities / POIs |
| Curated datasets | `app/data/*_events.json` | No | Event highlights for 20 French cities |
| OpenAgenda | `app/providers/events.py` | Optional | Live events for any city |

All keyless sources are open data, which is why CityChilly works for **any city**
without any signup.

---

## 4. Backend internals

### Request flow (`GET /api/discover`)

Two entry paths:

1. **City name** — `?city=Nantes&country=France` → server geocodes, then fetches.
2. **Pinned coordinates** — `?lat=…&lon=…&place_name=…&city_name=…` used by
   multi-postcode pins (skips redundant geocoding).

Common steps:

1. **Cache check** — in-memory TTL cache (`app/cache.py`, default 30 min), keyed
   by city/coords, OpenAgenda key hash, `live_events_only`, and language.
   `?refresh=1` bypasses read cache. Stale curated-only rows are rejected when a
   server OpenAgenda key is configured (`_discover_cache_usable`).
2. **Concurrent fetch** — weather, activities, and events via `asyncio.gather`.
3. **Attach weather** to outdoor items (forecast + 0–100 outdoor score).
4. **Return** `DiscoverResponse` (place, weather, activities, events, notices).

Query parameters of note:

| Param | Effect |
|-------|--------|
| `live_events_only=1` | OpenAgenda only; curated highlights omitted |
| `refresh=1` | Skip cache read; re-fetch upstream |
| `offset` | Pagination start index (default `0`) |
| `limit` | Page size (default from `CITYCHILLY_DISCOVER_PAGE_SIZE`, max 120). When set, the full result is still cached server-side and subsequent pages are sliced from cache |
| `category` | When combined with `offset`/`limit`, paginate only items in this category from the full server cache |
| `item_kind` | Optional `event` or `activity` — narrows filtered pagination |
| `outdoor_only=1` | Filtered pagination: outdoor items only |
| `event_period` | `today`, `hot_week`, `week`, `month`, or `quarter` — events only (activities pass through) |
| `date_from` / `date_to` | `YYYY-MM-DD` custom range (overrides `event_period` when both set) |
| `keyword` | Text search across title, description, keyword, location, category label, tags |
| `openagenda_only=1` | Filtered pagination: live OpenAgenda events only |
| `client_today` | `YYYY-MM-DD` anchor for period filters (browser local date) |
| `openagenda_key` | Per-request key override (validated; malformed keys ignored) |
| `lang` | `fr` (default) or `en` — notices and curated text selection |

### Geocode autocomplete (`GET /api/geocode?q=…`)

Returns area and postal-code suggestions for the search bar. French postcodes are
prioritized when the query looks numeric.

### Category model (`app/categories.py`)

A single taxonomy of 8 categories is shared by both activities and events, so the
UI offers one consistent set of filters. OSM tags (e.g. `leisure=park`,
`tourism=museum`) are mapped into these categories.

### Balanced activity selection

OpenStreetMap returns point POIs (bars, cafés) before area features (parks,
museums). To avoid the results being dominated by one category, `activities.py`
groups items by category and then selects them **round-robin**, guaranteeing a
diverse mix across all filters.

### Overpass resiliency

Public Overpass mirrors are community-run and frequently rate-limit or return
`429/503/504`. To keep activities working for **any city**, `run_overpass`
(`app/providers/http.py`) tries **several mirrors in order** (the French
instance first, which is fast and reliable for FR cities) with light retry and
back-off. If every mirror fails it raises `ProviderError`, and `/api/discover`
returns a "service busy, try again" notice **without caching** the empty result
— so the very next refresh can succeed instead of being stuck for the cache
window.

### Outdoor scoring (`app/providers/weather.py`)

WMO weather codes, precipitation probability and temperature are combined into a
heuristic 0–100 score. The UI turns this into a badge:

- `≥ 70` → *Great outdoors* (green)
- `45–69` → *Bring a layer* (amber)
- `< 45` → *Better indoors* (rose)

### Events: curated + live

- **Curated:** one JSON file per city under `app/data/` (e.g. `nantes_events.json`,
  `lyon_events.json`). Real venues with official URLs. Dates are generated
  **relative to today** (`day_offset`), so highlights always appear upcoming
  within `CITYCHILLY_EVENT_HORIZON_DAYS`.
- **Live (optional):** when `OPENAGENDA_KEY` is set, `events.py`:
  1. Finds agenda UIDs matching the city / region.
  2. Fetches events per agenda (geo bbox first, then city-name filters).
  3. Merges and deduplicates (up to 80 events).
  4. Maps OpenAgenda keywords → shared categories.

**OpenAgenda localization:** responses include multilingual `title` / `description`
dicts (`{ "fr": "…", "en": "…" }`). The API must **not** send OpenAgenda's
`monolingual` filter — French-only agendas (typical in Nantes) return `title: null`
for `monolingual=en`, and every event would be dropped. `_pick_lang()` in
`events.py` selects the best string for the requested `lang` after fetch.

**Live-only mode:** `live_only=True` returns only OpenAgenda items; if none are
found, curated data is not used as fallback (user-facing notice instead).

### Health (`GET /api/health`)

Validates the OpenAgenda key against `/v2/agendas` (cached ~20 s per key).
Returns `connection_ok`, `openagenda_enabled`, and default country/city settings.

---

## 5. Frontend internals

`web/app.js` is a small, dependency-free SPA:

- Central `state` — pins, pin data, filters, tabs, API bootstrap flag.
- **Multi-pin model** — users pin postal codes; each pin triggers a discover
  fetch by coordinates. Chips in the header show active pins.
- **Filters** — category, kind (event/activity/all), outdoor only, event time
  period, keyword search, live events only. Live-only also sets kind to events
  client-side. Whenever any narrowing filter is active and fewer than 12 items
  match the loaded cache, `ensureFilteredResults()` pages through the **full
  server-side discover cache** (`/api/discover` with matching query params) and
  merges new rows into `pinData` until enough matches appear or the filter is
  exhausted.
- **Client-side live filter** — items tagged `openagenda` pass; curated events
  (`curated` tag) are hidden when live-only is on.
- **Outdoor filter caveat** — OpenAgenda `is_outdoor` is inferred from category
  (nature / sports / markets only). Most live culture events are indoor, so
  **Outdoor only + Live only** often shows an empty grid even when live events
  exist.
- Single `card()` renderer for Discover, Favorites, and Agenda.
- **Favorites / Agenda** — full items in `localStorage`; tabs render without
  re-fetching.
- **Theming** — `data-theme` on `<html>`; palette CSS from `/api/theme.css`
  loaded on bootstrap (not in initial HTML, to avoid an extra request on load).
- **Parameters tab** — browser `openagenda_key`; `isPlausibleOpenAgendaKey()`
  rejects malformed pasted text; server-configured key takes precedence
  (`serverHasOpenAgendaKey()`).
- **Refresh button** — `reloadSelection({ refresh: true })` re-fetches all pins.
- **Health dot** — hidden until first `checkApiHealth()` (debounced on user
  interaction in header/main).

### Security / robustness notes
- All dynamic text is HTML-escaped before injection (`esc()`), guarding against
  XSS from upstream data.
- The loading overlay is debounced (220 ms) so cached responses don't flash a
  spinner.
- Every external link uses `target="_blank" rel="noopener"`.

---

## 6. API reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | The web app |
| `/api/health` | GET | Liveness + OpenAgenda key validation |
| `/api/categories` | GET | Category taxonomy (id, label, emoji) |
| `/api/geocode?q=` | GET | Autocomplete suggestions |
| `/api/discover` | GET | Place + weather + activities + events |
| `/api/keys` | GET | Which API keys the server expects (masked) |
| `/api/theme` | GET | Available color palettes |
| `/api/theme.css` | GET | CSS variables for active palette |
| `/api/cache/clear` | POST | Flush in-memory upstream cache |
| `/docs` | GET | Auto-generated OpenAPI / Swagger UI |

Examples:

```bash
# Discover by city (all sources)
curl "http://localhost:8000/api/discover?city=Nantes&lang=en"

# Live OpenAgenda events only
curl "http://localhost:8000/api/discover?city=Nantes&live_events_only=1&refresh=1"

# Autocomplete
curl "http://localhost:8000/api/geocode?q=44100&count=8"
```

---

## 7. Configuration

All settings are environment variables (see `.env.example`):

| Variable | Default | Meaning |
|----------|---------|---------|
| `CITYCHILLY_PORT` | `8000` | Host port (compose) |
| `CITYCHILLY_DEFAULT_CITY` | `Nantes` | Fallback city for API calls without `city` |
| `CITYCHILLY_DEFAULT_COUNTRY` | `France` | Default country for geocoding |
| `CITYCHILLY_THEME_CONFIG` | `config/theme.json` | Path to the palette config |
| `CITYCHILLY_ACTIVE_PALETTE` | *(from config)* | Override the active palette |
| `OPENAGENDA_KEY` | *(empty)* | Enable live events for any city |
| `CITYCHILLY_CACHE_TTL` | `1800` | Upstream cache TTL (seconds) |
| `CITYCHILLY_FORECAST_DAYS` | `16` | Weather horizon (max 16) |
| `CITYCHILLY_EVENT_HORIZON_DAYS` | `28` | Event look-ahead window |
| `CITYCHILLY_DISCOVER_PAGE_SIZE` | `40` | Default discover page size when `limit` is set |
| `CITYCHILLY_DISCOVER_MAX_ACTIVITIES` | `200` | Max activities fetched per discover (before paging) |
| `CITYCHILLY_DISCOVER_MAX_EVENTS` | `200` | Max OpenAgenda events merged per discover |
| `CITYCHILLY_OVERPASS_URLS` | FR + DE + private.coffee | Comma-separated Overpass mirrors, tried in order |
| `CITYCHILLY_OVERPASS_TIMEOUT` | `30` | Per-request Overpass timeout (seconds) |

---

## 8. Project layout

```
CityChill/
├── app/                     # FastAPI backend
│   ├── main.py              # App + API routes + static serving
│   ├── config.py            # Env-driven settings
│   ├── cache.py             # In-memory TTL cache
│   ├── categories.py        # Shared category taxonomy + OSM mapping
│   ├── theme.py             # Loads config/theme.json -> palette CSS
│   ├── i18n.py              # Server-side notice strings (en/fr)
│   ├── api_keys.py          # Key metadata for /api/keys
│   ├── models.py            # Pydantic response models
│   ├── data/
│   │   ├── nantes_events.json
│   │   ├── lyon_events.json
│   │   ├── paris_events.json
│   │   ├── …                # 20 curated city files total
│   │   └── curated_fr.json  # French overlays for curated titles
│   └── providers/
│       ├── http.py          # Shared async client + Overpass failover
│       ├── geocode.py       # Geocoding + place search
│       ├── weather.py
│       ├── activities.py    # OpenStreetMap / Overpass
│       └── events.py        # Curated + OpenAgenda
├── web/                     # Static front-end (no build)
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── i18n.js
│   ├── manifest.webmanifest
│   └── assets/logo.svg
├── config/
│   └── theme.json           # Editable color palette config
├── doc/                     # Documentation
├── Dockerfile
├── docker-compose.yml
└── requirements.txt
```

---

## 9. Changelog (recent)

| Date | Change |
|------|--------|
| 2026-06 | **Clean startup** — no default city, no API requests until user action |
| 2026-06 | **Multi-pin** — postal code search, autocomplete, coordinate-based discover |
| 2026-06 | **Live events only** toggle; refresh button; health indicator; Parameters tab |
| 2026-06 | **i18n** — English / French UI and localized API notices |
| 2026-06 | **Discover pagination** — `offset` / `limit` on `/api/discover`; **Load more** in the UI |
| 2026-06 | **OpenAgenda metro feeds** — prioritize metropolitan agendas (e.g. [Nantes Métropole](https://openagenda.com/en/nantesmetropole)), paginate API results, raise fetch cap to 800 |
| 2026-06 | **OpenAgenda fix** — removed `monolingual` filter so French-only cities (e.g. Nantes) work in English mode |
| 2026-06 | **Curated expansion** — datasets for 20 French cities |

---

## 10. Possible extensions

- Persist favorites/agenda server-side with user accounts.
- Add more curated city datasets under `app/data/`.
- Cache upstream responses in Redis for multi-instance deployments.
- Add a map view using the coordinates already returned per item.
- Richer `is_outdoor` inference for OpenAgenda events (tags, venue type).
