# CityChilly

> Discover what to do in any city — right now and for the weeks ahead.

CityChilly is a warm, friendly web app that helps you find **activities** and
**outdoor events** in a city, plan your own **agenda**, and keep a list of
**favorites**. It was originally designed for **Nantes, France**, but you can
type **any city in the world** and start exploring.

---

## What can I do with it?

### Explore a city

Type a city name (Nantes is the default) and CityChilly instantly shows you:

- **Events** happening now and in the coming weeks (curated highlights for
  Nantes, or live events anywhere when you connect OpenAgenda).
- **Activities** — parks, museums, viewpoints, theatres, sports spots, markets
  and more — pulled live from OpenStreetMap.
- A **weather forecast** for the next days, with an "outdoor suitability" hint on
  every outdoor card (e.g. *Great outdoors · 21°* or *Better indoors*) so you can
  plan around the rain.

### Filter by what you love

Filter everything by **category** with a single click:

🌳 Nature & Outdoors · 🏛 Culture & Arts · 🎵 Music & Nightlife ·
⚽ Sports & Wellness · 🧸 Family & Kids · 🍽 Food & Drink ·
🛍 Markets & Shopping · 🎪 Festivals & Fairs

You can also switch between **Events / Activities / All** and flip an
**"Outdoor only"** toggle.

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
official website, the OpenStreetMap object, or the live event listing.

### Make it yours

- **Light & dark mode** — toggle the 🌙 / ☀️ button (it remembers your choice and
  respects your system preference).
- **Modern, warm design** — soft gradients, rounded cards and cozy colors.
- **Customizable palette** — change the whole app's colors by editing a single
  file (`config/theme.json`); pick a preset like *sunset*, *citrus*, *berry*,
  *ember*, *ocean* or *forest*, or define your own. See `setup_guide.md`.
- **Works on phone and desktop** — the layout adapts to your screen.

---

## Where does the data come from?

| Data | Source | Coverage |
|------|--------|----------|
| City coordinates | [Open-Meteo Geocoding](https://open-meteo.com/) | Worldwide |
| Weather forecast | [Open-Meteo](https://open-meteo.com/) | Worldwide |
| Activities / points of interest | [OpenStreetMap](https://www.openstreetmap.org/) via Overpass | Worldwide |
| Events (default) | CityChilly curated dataset of real Nantes venues | Nantes |
| Events (optional, live) | [OpenAgenda](https://openagenda.com/) | Worldwide (needs a free key) |

The geocoding, weather and activity sources are **keyless** — CityChilly works
out of the box for any city. To get **live events for any city**, add a free
OpenAgenda key (see `setup_guide.md`).

---

## Your data stays with you

Your **agenda** and **favorites** are stored **locally in your browser**
(localStorage). There is no account to create and nothing is sent to a server.
Clear them anytime from your browser, or simply remove the items in the app.

---

## Next steps

- New here? Read **[setup_guide.md](./setup_guide.md)** to run the app in a few
  minutes.
- Curious about how it's built? See **[technical.md](./technical.md)**.
