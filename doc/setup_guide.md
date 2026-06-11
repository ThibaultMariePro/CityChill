# CityChilly — Setup Guide

Welcome! This guide gets CityChilly running on your computer or server in just a
few minutes. No coding experience required. 🙂

---

## The fastest way: Docker (recommended)

This is the easiest method and works the same on Windows, macOS and Linux.

### 1. Install Docker

If you don't have it yet, install **Docker Desktop** (Windows/macOS) or **Docker
Engine** (Linux) from <https://docs.docker.com/get-docker/>.

### 2. Start CityChilly

Open a terminal **in the project folder** (the one containing
`docker-compose.yml`) and run:

```bash
docker compose up -d --build
```

That's it! The first run downloads everything and builds the app (about a
minute).

### 3. Open the app

Go to **<http://localhost:8000>** in your browser.

You should see a **clean welcome screen** — no city is loaded automatically and
no data is fetched until you search. Type a city or postal code and press
**Explore**.

### 4. Stop it later

```bash
docker compose down
```

---

## Using the app

1. **Search a location** — type a **city name** or **postal code** in the top bar
   (e.g. *Nantes*, *69001*, *Paris*) and press **Explore**. Suggestions appear
   as you type; you can pin one or several postal codes for the same area.
2. **Browse** the cards. Each shows whether it's an **Event** or **Activity**,
   the date, the place, the category and — for outdoor things — a **weather
   hint**. Live OpenAgenda events show a **Live** badge; curated highlights show
   **ℹ️**.
3. **Filter** by category (the colored chips), by type
   (**All / Events / Activities**), by **time period** (week / month / quarter),
   flip **Outdoor only**, enable **Live events only** to hide curated highlights,
   tap **🔥 Hot today** for single-day live events today, or **📅 Hot this week**
   for live events ending within the next 7 days.
4. **Load more** — when additional results are available, use **Load more** below
   the card grid to fetch the next page (40 items at a time by default).
5. **Refresh** — use the ↻ button next to the filters to re-fetch live events
   for your current selection (bypasses the server cache).
6. **Plan** — click **+ Add to agenda** to build your day-by-day roadmap in the
   **My Agenda** tab.
7. **Save** — click the **heart** on any card to keep it in **Favorites**.
8. **Check the source** — every card has a **↗ Source** button that opens the
   original, official page.
9. **Switch theme** — use the 🌙 / ☀️ button (top right) for light or dark mode.
10. **Language** — switch between **English** and **French** in the
    **Parameters** tab.
11. **Connection status** — a dot next to the logo (🟢 / 🔴) appears after your
    first interaction; it reflects whether the OpenAgenda key is valid.

> Your agenda and favorites are saved **in your browser**, so they'll still be
> there next time you open CityChilly on the same device.

---

## Optional: live events for *any* city

CityChilly shows **live activities for any city** (from OpenStreetMap) without
any setup. For **live events** (OpenAgenda) worldwide, connect a free key:

1. Create a free key at <https://developers.openagenda.com/>.
2. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Open `.env` and set your key:
   ```
   OPENAGENDA_KEY=your_key_here
   ```
4. Restart the app:
   ```bash
   docker compose up -d --build
   ```

You can also paste a key in the **Parameters** tab (stored in your browser). If
the server already has `OPENAGENDA_KEY` in `.env`, the browser key is ignored so
the server configuration is not accidentally overridden.

---

## Curated event highlights (no key required)

For **20 French cities**, CityChilly includes a curated dataset of real venues
and recurring highlights (Nantes, Paris, Lyon, Marseille, and others — see
`app/data/*_events.json`). These appear alongside live OpenAgenda events when a
key is configured, or on their own when it is not. Enable **Live events only**
to hide them and see OpenAgenda results exclusively.

---

## Changing the colors (palette)

CityChilly's colors live in one simple file: **`config/theme.json`**.

To switch to a different look, open it and change the `"active"` line to one of
the built-in palettes:

```json
"active": "ocean",
```

Built-in palettes: **sunset** (warm default), **citrus**, **berry**, **ember**,
**ocean**, **forest**, **cappuccino**, **lavender**, **honey**.

Then just **refresh your browser** — no rebuild needed (the file is mounted into
the container). The full palette CSS is loaded from `/api/theme.css` the first
time you interact with the app (not on the initial blank screen).

Want your own colors? Edit a palette's `brand` values (any CSS color works) or
add a new palette and point `"active"` at it. You can also override the choice
without editing the file by setting `CITYCHILLY_ACTIVE_PALETTE` in `.env`.

---

## Putting CityChilly on the internet

CityChilly listens on port **8000**. To make it reachable from the internet, you
can:

- **Run it on a server** (a small cloud VM works great) and point a domain at it.
- Put a reverse proxy with HTTPS in front of it, for example **Caddy**:

  ```caddyfile
  citychilly.example.com {
      reverse_proxy localhost:8000
  }
  ```

  Caddy automatically obtains a free TLS certificate, so your app is served over
  `https://`.

- Or use any tunnel (e.g. **Cloudflare Tunnel**, **ngrok**) for a quick public
  URL during testing.

To change the public port, set `CITYCHILLY_PORT` in your `.env` (e.g.
`CITYCHILLY_PORT=80`).

---

## Running without Docker (for developers)

> Requires **Python 3.11 or 3.12** (Python 3.13/3.14 may lack some prebuilt
> dependencies).

```bash
python3.12 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Then open <http://localhost:8000>.

---

## Troubleshooting

| Problem | What to do |
|---------|------------|
| "City lookup service unavailable" | Check your internet connection; the app needs to reach the open data APIs. |
| Activities list is empty | The OpenStreetMap (Overpass) service can be briefly busy — wait a moment and search again. |
| No live events / red dot next to logo | Add a valid `OPENAGENDA_KEY` in `.env` or Parameters. Use **Clear keys** in Parameters if you accidentally pasted invalid text. |
| Live only shows nothing for a city | Press **Refresh** (↻). If **Outdoor only** is on, turn it off — most live events are not tagged outdoor. |
| Live only empty for Nantes (fixed) | Older builds dropped French-only OpenAgenda titles in English mode; rebuild with the latest code. |
| Only curated events, no Live badge | Server key may be missing, invalid, or cached — restart Docker, hard-refresh, use Refresh. |
| Port 8000 already in use | Set a different `CITYCHILLY_PORT` in `.env` and restart. |
| Favorites/agenda disappeared | They're stored per-browser/device. Use the same browser, and avoid clearing site data. |
| Stale results after config change | Click **Refresh**, open Parameters → **Clear cache**, or `POST /api/cache/clear`. |

Enjoy exploring! 🌍
