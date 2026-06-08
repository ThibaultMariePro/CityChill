# CityChilly — Technical Overview

This document explains how CityChilly is built, the technology choices behind it,
and how the pieces fit together.

---

## 1. High-level architecture

CityChilly is a single deployable unit: a **FastAPI** backend that also serves a
**static, build-free web UI**. There is no separate frontend server and no
database — which makes it trivial to dockerize and expose on the internet.

```
                ┌──────────────────────────────────────────────┐
                │                Browser (SPA)                  │
                │  index.html · styles.css · app.js (vanilla)   │
                │  localStorage: favorites + agenda + theme     │
                └───────────────┬──────────────────────────────┘
                                │  fetch /api/*
                                ▼
                ┌──────────────────────────────────────────────┐
                │              FastAPI (app/main.py)            │
                │  /api/discover  /api/categories  /api/health  │
                │  + serves the static web UI                   │
                │  in-memory TTL cache (app/cache.py)           │
                └───────┬───────────┬───────────┬──────────────┘
                        │           │           │
            geocode.py  │  weather.py│ activities.py / events.py
                        ▼           ▼           ▼
              Open-Meteo     Open-Meteo    OpenStreetMap (Overpass)
              Geocoding       Forecast      + curated dataset
                                            + OpenAgenda (optional)
```

### Why this shape?

- **One container, no build step.** The UI is plain HTML/CSS/JS served by
  FastAPI, so the Docker image is a single small Python image. No Node, no
  bundler, no `npm install` to break.
- **Stateless backend.** All user state (favorites, agenda, theme) lives in the
  browser. The server only aggregates public data, so it scales horizontally and
  needs no database.
- **Fail-soft providers.** Each data source is isolated and degrades gracefully:
  if Overpass or OpenAgenda is briefly unavailable, the rest of the app keeps
  working and the UI shows a friendly notice.

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
- **Modern CSS** with custom properties for theming — `web/styles.css`.
- **Google Fonts**: *Fraunces* (display) + *Inter* (body).
- **localStorage** for favorites, agenda and theme persistence.

### Tooling / ops
- **Docker** + **docker compose** for packaging and deployment.
- Container **HEALTHCHECK** hitting `/api/health`.

---

## 3. External data sources

| Provider | Module | Key required? | Purpose |
|----------|--------|---------------|---------|
| Open-Meteo Geocoding | `app/providers/geocode.py` | No | City name → lat/lon/country |
| Open-Meteo Forecast | `app/providers/weather.py` | No | Up to 16-day daily forecast |
| OpenStreetMap Overpass | `app/providers/activities.py` | No | Permanent activities / POIs |
| Curated dataset | `app/data/nantes_events.json` | No | Real Nantes event highlights |
| OpenAgenda | `app/providers/events.py` | Optional | Live events for any city |

All keyless sources are open data, which is why CityChilly works for **any city**
without any signup.

---

## 4. Backend internals

### Request flow (`GET /api/discover?city=...`)

1. **Cache check** — an in-memory TTL cache (`app/cache.py`, default 30 min)
   keyed by city avoids hammering upstream APIs.
2. **Geocode** the city to coordinates (`geocode_city`).
3. **Concurrently** fetch weather, activities and events with
   `asyncio.gather` — the three slowest calls happen in parallel.
4. **Attach weather** to outdoor items: each outdoor card gets the forecast for
   its date (or today for undated activities) plus a 0–100 *outdoor score*.
5. **Return** a single `DiscoverResponse` (place + weather + activities + events
   + human-friendly notices).

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

- **Curated:** `nantes_events.json` holds real Nantes venues with official URLs.
  Dates are generated **relative to today** (`day_offset`), so the demo always
  shows upcoming plans within the configured horizon.
- **Live (optional):** when `OPENAGENDA_KEY` is set, `events.py` searches
  OpenAgenda for an agenda matching the city and pulls current + upcoming events
  for **any city**. If anything fails it falls back to the curated data.

---

## 5. Frontend internals

`web/app.js` is a small, dependency-free SPA:

- A central `state` object holds the current place, data, filters and active tab.
- A single `card()` renderer is reused across **Discover**, **Favorites** and (in
  compact form) **Agenda**.
- **Favorites** and **Agenda** are plain objects keyed by item id, persisted to
  `localStorage`. Because the full item is stored, these tabs render instantly
  without re-fetching.
- **Agenda** groups items by start date and sorts chronologically (undated
  activities fall under "Anytime / flexible").
- **Theming** is driven by a `data-theme` attribute on `<html>` and CSS custom
  properties; the choice is persisted and defaults to the OS preference.
- **Color palette** is data-driven: `config/theme.json` defines named palettes,
  and `app/theme.py` turns the active one into CSS variables served at
  `/api/theme.css` (linked after `styles.css`, so it overrides the defaults).
  Category gradients and background tints reference these variables, so a single
  config edit recolors the whole UI — no rebuild needed (the file is mounted as a
  volume in `docker-compose.yml`).

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
| `/api/health` | GET | Liveness + whether OpenAgenda is enabled |
| `/api/categories` | GET | The category taxonomy (id, label, emoji) |
| `/api/discover?city=&country=` | GET | Place + weather + activities + events |
| `/docs` | GET | Auto-generated OpenAPI / Swagger UI |

Example:

```bash
curl "http://localhost:8000/api/discover?city=Nantes"
```

---

## 7. Configuration

All settings are environment variables (see `.env.example`):

| Variable | Default | Meaning |
|----------|---------|---------|
| `CITYCHILLY_PORT` | `8000` | Host port (compose) |
| `CITYCHILLY_DEFAULT_CITY` | `Nantes` | City shown on first load |
| `CITYCHILLY_THEME_CONFIG` | `config/theme.json` | Path to the palette config |
| `CITYCHILLY_ACTIVE_PALETTE` | *(from config)* | Override the active palette |
| `OPENAGENDA_KEY` | *(empty)* | Enable live events for any city |
| `CITYCHILLY_CACHE_TTL` | `1800` | Upstream cache TTL (seconds) |
| `CITYCHILLY_FORECAST_DAYS` | `16` | Weather horizon (max 16) |
| `CITYCHILLY_EVENT_HORIZON_DAYS` | `28` | Event look-ahead window |
| `CITYCHILLY_OVERPASS_URLS` | FR + DE + private.coffee | Comma-separated Overpass mirrors, tried in order |
| `CITYCHILLY_OVERPASS_TIMEOUT` | `30` | Per-request Overpass timeout (seconds) |

---

## 8. Project layout

```
quicktrip/
├── app/                     # FastAPI backend
│   ├── main.py              # App + API routes + static serving
│   ├── config.py            # Env-driven settings
│   ├── cache.py             # In-memory TTL cache
│   ├── categories.py        # Shared category taxonomy + OSM mapping
│   ├── theme.py             # Loads config/theme.json -> palette CSS
│   ├── models.py            # Pydantic response models
│   ├── data/
│   │   └── nantes_events.json
│   └── providers/
│       ├── http.py          # Shared async client
│       ├── geocode.py
│       ├── weather.py
│       ├── activities.py    # OpenStreetMap / Overpass
│       └── events.py        # Curated + OpenAgenda
├── web/                     # Static front-end (no build)
│   ├── index.html
│   ├── styles.css
│   ├── app.js
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

## 9. Possible extensions

- Persist favorites/agenda server-side with user accounts.
- Add more curated city datasets alongside `nantes_events.json`.
- Cache upstream responses in Redis for multi-instance deployments.
- Add a map view using the coordinates already returned per item.
