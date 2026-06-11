# CityChilly

> Discover what to do in any city — right now and for the weeks ahead.

CityChilly is a warm, friendly web app that helps you find **activities** and
**outdoor events** in a city, plan your own **agenda**, and keep a list of
**favorites**. Search **any city or postal code in the world** — the app starts
on a clean screen and loads data only when you ask.

---

## What can I do with it?

### Explore a city

Search a city or postal code and CityChilly shows you:

- **Events** happening now and in the coming weeks — live listings from
  [OpenAgenda](https://openagenda.com/) when a key is configured, plus curated
  highlights for **20 French cities** (real venues with official links).
- **Activities** — parks, museums, viewpoints, theatres, sports spots, markets
  and more — pulled live from OpenStreetMap.
- A **weather forecast** for the next days, with an "outdoor suitability" hint on
  every outdoor card (e.g. *Great outdoors · 21°* or *Better indoors*) so you can
  plan around the rain.

Pin **one or several postal codes** to narrow results to specific neighbourhoods.

### Filter by what you love

Filter everything by **category** with a single click:

🌳 Nature & Outdoors · 🏛 Culture & Arts · 🎵 Music & Nightlife ·
⚽ Sports & Wellness · 🧸 Family & Kids · 🍽 Food & Drink ·
🛍 Markets & Shopping · 🎪 Festivals & Fairs

You can also switch between **Events / Activities / All**, filter by **time
period**, flip **Outdoor only**, or enable **Live events only** to see only
OpenAgenda listings (curated highlights hidden). **🔥 Hot today** shows live
single-day events occurring today. **📅 Hot this week** shows live events whose
**end date** falls within the next 7 days (cards highlight **ends …** in red).
When there are more results than fit on one screen, use **Load more** to fetch
the next page.

### Build your own agenda / roadmap

Hit **"+ Add to agenda"** on any card to drop it into **My Agenda**. Your agenda
is automatically **grouped and sorted by date**, so it reads like a real
day-by-day roadmap for your trip or weekend.

### Save your favorites

Tap the **heart** on any card to save it. All your saved items live in the
**Favorites** tab so you can find them again in one tap.

### Every card links to its source

Transparency first: **every single piece of information has a clickable source**.
Each card has a **↗ Source** button that opens the original page — the venue's
official website, the OpenStreetMap object, or the live event listing. The
**🔍 Search** button runs a Google query with the **title and location** (venue
or place name).

### Make it yours

- **Light & dark mode** — toggle the 🌙 / ☀️ button (it remembers your choice and
  respects your system preference).
- **English & French** — full UI translation; notices from the API follow the
  selected language.
- **Parameters** — optional browser-side API keys, palette picker, cache reset.
- **Connection indicator** — 🟢 / 🔴 next to the logo when OpenAgenda is
  configured (checked after you interact with the app).
- **Modern, warm design** — soft gradients, rounded cards and cozy colors.
- **Customizable palette** — change the whole app's colors by editing a single
  file (`config/theme.json`); pick a preset like *sunset*, *citrus*, *berry*,
  *ember*, *ocean*, *forest*, *cappuccino*, *lavender*, or *honey*, or define
  your own. See `setup_guide.md`.
- **Works on phone and desktop** — the layout adapts to your screen.

---

## Where does the data come from?

| Data | Source | Coverage |
|------|--------|----------|
| City / postal code lookup | [Open-Meteo Geocoding](https://open-meteo.com/) | Worldwide |
| Weather forecast | [Open-Meteo](https://open-meteo.com/) | Worldwide |
| Activities / points of interest | [OpenStreetMap](https://www.openstreetmap.org/) via Overpass | Worldwide |
| Events (curated) | CityChilly datasets (`app/data/*_events.json`) | 20 French cities |
| Events (live) | [OpenAgenda](https://openagenda.com/) | Worldwide (needs a free key) |

The geocoding, weather and activity sources are **keyless** — CityChilly works
out of the box for any city. To get **live events for any city**, add a free
OpenAgenda key (see `setup_guide.md`).

---

## Your data stays with you

Your **agenda**, **favorites**, **theme**, **language**, and optional **browser
API keys** are stored **locally in your browser** (localStorage). There is no
account to create. Server-side configuration (`OPENAGENDA_KEY` in `.env`) is
never written into your browser when the server is already configured.

Clear them anytime from the **Parameters** tab or your browser settings.

---

## Next steps

- New here? Read **[setup_guide.md](./setup_guide.md)** to run the app in a few
  minutes.
- Curious about how it's built? See **[technical.md](./technical.md)**.
