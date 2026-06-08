/* =========================================================================
   CityChilly front-end logic (vanilla JS, no build step)
   ========================================================================= */
(() => {
  "use strict";

  const API = "";
  const LS = {
    theme:     "citychilly:theme",
    city:      "citychilly:lastCity",   // legacy – read for migration only
    pins:      "citychilly:pins",       // new multi-pin storage
    favorites: "citychilly:favorites",
    agenda:    "citychilly:agenda",
  };

  /* ── state ───────────────────────────────────────────────────────────── */
  const state = {
    // Multi-pin: each entry is a lightweight PlaceSuggestion-like object
    pins:    [],   // [{id, name, display, latitude, longitude, postcodes}]
    pinData: {},   // id → DiscoverResponse (place, weather, activities, events, notices)
    // UI
    categories: [],
    filters: { category: "all", kind: "all", outdoorOnly: false },
    tab: "discover",
  };

  // Autocomplete state
  let acTimer      = null;
  let acFocused    = -1;
  let acController = null;

  /* ── tiny helpers ────────────────────────────────────────────────────── */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls)     n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  const store = {
    read(key)      { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } },
    write(key, val){ localStorage.setItem(key, JSON.stringify(val)); },
  };

  /* ── pin persistence ─────────────────────────────────────────────────── */
  const makePinId = (lat, lon) => `${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`;
  const makePostcodePinId = (code) => `pc:${String(code).trim()}`;
  const looksLikePostcode = (q) => /^\d{4,6}$/.test(String(q).trim());

  function isPostcodePinned(code) {
    return state.pins.some((p) => p.id === makePostcodePinId(code));
  }

  function readPins() {
    try {
      const raw = localStorage.getItem(LS.pins);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length ? parsed : null;
    } catch { return null; }
  }

  function savePins() {
    localStorage.setItem(
      LS.pins,
      JSON.stringify(
        state.pins.map(({ id, name, display, latitude, longitude, postcode, postcodes, kind }) => ({
          id,
          name,
          display: display || name,
          latitude,
          longitude,
          postcode: postcode || null,
          postcodes: postcodes || (postcode ? [postcode] : []),
          kind: kind || (postcode ? "postcode" : "place"),
        }))
      )
    );
  }

  function pinLabel(pin) {
    return pin.postcode || pin.name;
  }

  function pinSubtitle(pin) {
    if (pin.postcode && pin.name && pin.name !== pin.postcode) return pin.name;
    return pin.display || "";
  }

  /* ── helpers ─────────────────────────────────────────────────────────── */
  const catMeta = (id) =>
    state.categories.find((c) => c.id === id) || { label: id, emoji: "✨" };

  const fmtDay = (iso) => {
    if (!iso) return null;
    return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
      weekday: "short", month: "short", day: "numeric",
    });
  };
  const fmtRange = (start, end) => {
    if (!start) return "Anytime";
    if (!end || end === start) return fmtDay(start);
    return `${fmtDay(start)} – ${fmtDay(end)}`;
  };

  const wxLevel = (score) => (score >= 70 ? "good" : score >= 45 ? "ok" : "bad");
  const wxLabel = (score) => (score >= 70 ? "Great outdoors" : score >= 45 ? "Bring a layer" : "Better indoors");

  /* ── weather ─────────────────────────────────────────────────────────── */
  function renderWeather() {
    const strip = $("#weather-strip");
    strip.innerHTML = "";
    const firstPin = state.pins.find((p) => state.pinData[p.id]);
    const weather  = firstPin ? state.pinData[firstPin.id]?.weather : null;
    if (!weather?.days?.length) return;
    weather.days.slice(0, 8).forEach((d, i) => {
      const node = el("div", "wx-day");
      const name = i === 0
        ? "Today"
        : new Date(d.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" });
      const tmax = d.temp_max != null ? Math.round(d.temp_max) : "–";
      const tmin = d.temp_min != null ? Math.round(d.temp_min) : "–";
      node.innerHTML = `
        <div class="wx-day__name">${esc(name)}</div>
        <div class="wx-day__icon" title="${esc(d.summary)}">${d.emoji}</div>
        <div class="wx-day__temp">${tmax}°<small> / ${tmin}°</small></div>`;
      strip.appendChild(node);
    });
  }

  /* ── hero ─────────────────────────────────────────────────────────────── */
  function renderHero() {
    const loaded = state.pins.filter((p) => state.pinData[p.id]);
    if (!loaded.length) return;
    const eyebrow = $("#place-eyebrow");
    const codes = loaded.map((p) => p.postcode).filter(Boolean);
    if (codes.length) {
      $("#place-name").textContent = codes.join(" · ");
      const places = [...new Set(loaded.map((p) => p.name).filter(Boolean))];
      $("#place-sub").textContent = places.join(" · ");
      if (eyebrow) eyebrow.textContent = "Postal codes in scope";
    } else if (loaded.length === 1) {
      const place = state.pinData[loaded[0].id].place;
      $("#place-name").textContent = place.name;
      $("#place-sub").textContent  = [place.admin, place.country].filter(Boolean).join(", ");
      if (eyebrow) eyebrow.textContent = "Now exploring";
    } else {
      const names = loaded.map((p) => state.pinData[p.id].place.name);
      $("#place-name").textContent = `${loaded.length} locations`;
      $("#place-sub").textContent  = names.join(" · ");
      if (eyebrow) eyebrow.textContent = "Now exploring";
    }
  }

  /* ── notices ─────────────────────────────────────────────────────────── */
  function allNotices() {
    const seen = new Set();
    const out  = [];
    for (const pin of state.pins) {
      for (const n of state.pinData[pin.id]?.notices ?? []) {
        if (!seen.has(n)) { seen.add(n); out.push(n); }
      }
    }
    return out;
  }

  function renderNotices() {
    const box = $("#notices");
    box.innerHTML = "";
    const notices = allNotices();
    if (!notices.length) { box.hidden = true; return; }
    box.hidden = false;
    notices.forEach((n) => box.appendChild(el("div", "notice", `💡 ${esc(n)}`)));
  }

  /* ── favorites & agenda ──────────────────────────────────────────────── */
  const favorites = () => store.read(LS.favorites);
  const agenda    = () => store.read(LS.agenda);
  const isFav     = (id) => Boolean(favorites()[id]);
  const inAgenda  = (id) => Boolean(agenda()[id]);

  function toggleFav(item) {
    const f = favorites();
    if (f[item.id]) { delete f[item.id]; toast("Removed from favorites"); }
    else            { f[item.id] = item;  toast("Saved to favorites ❤️"); }
    store.write(LS.favorites, f);
    refreshCounts();
    renderActivePanel();
  }

  function toggleAgenda(item) {
    const a = agenda();
    if (a[item.id]) { delete a[item.id]; toast("Removed from agenda"); }
    else            { a[item.id] = item;  toast("Added to your agenda 🗓️"); }
    store.write(LS.agenda, a);
    refreshCounts();
    renderActivePanel();
  }

  function refreshCounts() {
    $("#fav-count").textContent    = Object.keys(favorites()).length;
    $("#agenda-count").textContent = Object.keys(agenda()).length;
  }

  /* ── card ────────────────────────────────────────────────────────────── */
  function card(item) {
    const meta = catMeta(item.category);
    const node = el("article", "card");
    node.dataset.id = item.id;

    const media = el("div", `card__media cat-${esc(item.category)}`);
    media.innerHTML = `
      <span class="card__emoji">${meta.emoji}</span>
      <span class="card__kind">${item.kind === "event" ? "Event" : "Activity"}</span>
      <button class="card__fav ${isFav(item.id) ? "is-active" : ""}" title="Save to favorites" aria-label="Save to favorites">
        ${isFav(item.id) ? "❤️" : "🤍"}
      </button>`;
    media.querySelector(".card__fav").addEventListener("click", () => toggleFav(item));

    const body    = el("div", "card__body");
    const metaBits = [];
    if (item.kind === "event")  metaBits.push(`<span>🗓️ ${esc(fmtRange(item.start, item.end))}</span>`);
    if (item.location_name)     metaBits.push(`<span>📍 ${esc(item.location_name)}</span>`);
    metaBits.push(`<span>${meta.emoji} ${esc(meta.label)}</span>`);

    let wxBadge = "";
    if (item.weather) {
      const lvl = wxLevel(item.weather.outdoor_score);
      const t   = item.weather.temp_max != null ? ` · ${Math.round(item.weather.temp_max)}°` : "";
      wxBadge = `<span class="wx-badge" data-level="${lvl}">${item.weather.emoji} ${esc(wxLabel(item.weather.outdoor_score))}${t}</span>`;
    }

    body.innerHTML = `
      <h3 class="card__title">${esc(item.title)}</h3>
      ${item.description ? `<p class="card__desc">${esc(item.description)}</p>` : ""}
      ${wxBadge}
      <div class="card__meta">${metaBits.join("")}</div>`;

    const actions   = el("div", "card__actions");
    const agendaBtn = el(
      "button",
      `btn ${inAgenda(item.id) ? "btn--in-agenda" : "btn--primary"}`,
      inAgenda(item.id) ? "✓ In agenda" : "+ Add to agenda"
    );
    agendaBtn.addEventListener("click", () => toggleAgenda(item));

    const source = el("a", "btn btn--ghost btn--source");
    source.href    = item.source_url;
    source.target  = "_blank";
    source.rel     = "noopener";
    source.title   = `Source: ${item.source_name}`;
    source.innerHTML = "↗ Source";

    actions.append(agendaBtn, source);
    body.appendChild(actions);
    node.append(media, body);
    return node;
  }

  /* ── items merging ───────────────────────────────────────────────────── */
  function allItems() {
    const seen  = new Set();
    const items = [];
    for (const pin of state.pins) {
      const data = state.pinData[pin.id];
      if (!data) continue;
      for (const item of [...(data.events ?? []), ...(data.activities ?? [])]) {
        if (!seen.has(item.id)) { seen.add(item.id); items.push(item); }
      }
    }
    return items;
  }

  function filteredItems() {
    const { category, kind, outdoorOnly } = state.filters;
    let items = allItems();
    if (kind !== "all")     items = items.filter((it) => it.kind === kind);
    if (category !== "all") items = items.filter((it) => it.category === category);
    if (outdoorOnly)        items = items.filter((it) => it.is_outdoor);
    return items;
  }

  /* ── discover ────────────────────────────────────────────────────────── */
  function renderDiscover() {
    const grid  = $("#discover-grid");
    const empty = $("#discover-empty");
    const meta  = $("#results-meta");
    grid.innerHTML = "";
    const items   = filteredItems();
    const loaded  = state.pins.filter((p) => state.pinData[p.id]);
    const codes = loaded.map((p) => p.postcode).filter(Boolean);
    const locText = codes.length
      ? codes.join(", ")
      : loaded.length > 1
        ? `${loaded.length} locations`
        : (loaded[0] ? state.pinData[loaded[0].id].place.name : "your city");

    meta.textContent = `${items.length} result${items.length === 1 ? "" : "s"} in ${locText}`;

    if (!items.length) {
      empty.hidden = false;
      empty.innerHTML = `<div class="empty__emoji">🧐</div><h3>Nothing matches these filters</h3><p>Try another category or turn off "Outdoor only".</p>`;
      return;
    }
    empty.hidden = true;
    const frag = document.createDocumentFragment();
    items.forEach((it) => frag.appendChild(card(it)));
    grid.appendChild(frag);
  }

  /* ── favorites ───────────────────────────────────────────────────────── */
  function renderFavorites() {
    const grid  = $("#favorites-grid");
    const empty = $("#favorites-empty");
    const items = Object.values(favorites());
    grid.innerHTML = "";
    if (!items.length) { empty.hidden = false; return; }
    empty.hidden = true;
    const frag = document.createDocumentFragment();
    items.forEach((it) => frag.appendChild(card(it)));
    grid.appendChild(frag);
  }

  /* ── agenda ──────────────────────────────────────────────────────────── */
  function renderAgenda() {
    const list  = $("#agenda-list");
    const empty = $("#agenda-empty");
    const items = Object.values(agenda());
    list.innerHTML = "";
    if (!items.length) { empty.hidden = false; return; }
    empty.hidden = true;

    const groups = {};
    items.forEach((it) => {
      const key = it.start || "Anytime";
      (groups[key] = groups[key] || []).push(it);
    });
    const keys = Object.keys(groups).sort((a, b) => {
      if (a === "Anytime") return 1;
      if (b === "Anytime") return -1;
      return a.localeCompare(b);
    });

    keys.forEach((key) => {
      const dayBlock = el("div", "agenda__day");
      const label    = key === "Anytime" ? "Anytime / flexible" : fmtDay(key);
      const head     = el("h3", "agenda__date", `${esc(label)} <span class="pill">${groups[key].length} planned</span>`);
      dayBlock.appendChild(head);

      groups[key].forEach((it) => {
        const meta = catMeta(it.category);
        const row  = el("div", "agenda__row");
        const sub  = [it.location_name, meta.label].filter(Boolean).map(esc).join(" · ");
        row.innerHTML = `
          <div class="agenda__emoji cat-${esc(it.category)}">${meta.emoji}</div>
          <div class="agenda__info">
            <p class="agenda__title">${esc(it.title)}</p>
            <p class="agenda__sub">${sub}</p>
          </div>`;
        const actions = el("div", "agenda__actions");
        const src     = el("a", "btn btn--ghost");
        src.href = it.source_url; src.target = "_blank"; src.rel = "noopener"; src.innerHTML = "↗ Source";
        const rm = el("button", "btn btn--ghost", "✕ Remove");
        rm.addEventListener("click", () => toggleAgenda(it));
        actions.append(src, rm);
        row.appendChild(actions);
        dayBlock.appendChild(row);
      });
      list.appendChild(dayBlock);
    });
  }

  function renderActivePanel() {
    if (state.tab === "discover")  renderDiscover();
    else if (state.tab === "favorites") renderFavorites();
    else if (state.tab === "agenda")    renderAgenda();
  }

  /* ── chips ───────────────────────────────────────────────────────────── */
  function renderChips() {
    const wrap = $("#category-chips");
    wrap.innerHTML = "";
    const all = el("button", `chip ${state.filters.category === "all" ? "is-active" : ""}`, "✨ All");
    all.addEventListener("click", () => setCategory("all"));
    wrap.appendChild(all);
    state.categories.forEach((c) => {
      const chip = el("button", `chip ${state.filters.category === c.id ? "is-active" : ""}`, `${c.emoji} ${esc(c.label)}`);
      chip.addEventListener("click", () => setCategory(c.id));
      wrap.appendChild(chip);
    });
  }
  function setCategory(id) {
    state.filters.category = id;
    renderChips();
    renderDiscover();
  }

  /* ── pinned chips ────────────────────────────────────────────────────── */
  function renderPinnedChips() {
    const bar       = $("#pinned-bar");
    const container = $("#pinned-chips");
    if (!state.pins.length) { bar.hidden = true; return; }
    bar.hidden        = false;
    container.innerHTML = "";

    state.pins.forEach((pin) => {
      const loaded = Boolean(state.pinData[pin.id]);
      const label  = pinLabel(pin);
      const sub    = pin.postcode ? pinSubtitle(pin) : "";
      const chip = el("div", `pin-chip${!loaded ? " is-loading" : ""}`, "");
      chip.innerHTML = `
        <span class="pin-chip__dot${!loaded ? " is-loading" : ""}"></span>
        <span class="pin-chip__name">${esc(label)}</span>
        ${sub && sub !== label ? `<span class="pin-chip__sub">${esc(sub)}</span>` : ""}
        <button class="pin-chip__remove" type="button" title="Remove ${esc(label)}" aria-label="Remove ${esc(label)}">×</button>`;
      chip.querySelector(".pin-chip__remove").addEventListener("click", () => removePin(pin.id));
      container.appendChild(chip);
    });
  }

  function suggestionToPin(suggestion) {
    const postcode = suggestion.postcode || suggestion.postcodes?.[0] || null;
    const id = postcode ? makePostcodePinId(postcode) : suggestion.id;
    return {
      id,
      kind: suggestion.kind || (postcode ? "postcode" : "place"),
      postcode,
      name: suggestion.name,
      display: suggestion.display || suggestion.name,
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
      postcodes: postcode ? [postcode] : (suggestion.postcodes || []),
    };
  }

  function addPin(suggestion) {
    const pin = suggestionToPin(suggestion);
    if (state.pins.some((p) => p.id === pin.id)) {
      toast(`${pinLabel(pin)} is already pinned`);
      closeDropdown();
      return;
    }
    state.pins.push(pin);
    renderPinnedChips();
    closeDropdown();
    $("#city-input").value = "";
    loadPlace(pin);
  }

  async function addPinFromPostcode(code, parent) {
    const clean = String(code).trim();
    if (!clean) return;
    if (isPostcodePinned(clean)) {
      toast(`${clean} is already pinned`);
      return;
    }
    try {
      const res = await fetch(`${API}/api/geocode?q=${encodeURIComponent(clean)}`);
      if (!res.ok) throw new Error("Lookup failed");
      const data = await res.json();
      const suggestions = data.suggestions || [];
      const match = suggestions.find((s) => s.kind === "postcode" || s.postcode === clean) || suggestions[0];
      if (!match) {
        toast(`Could not find postal code ${clean}`);
        return;
      }
      const pin = suggestionToPin(match);
      if (parent?.name && pin.postcode) {
        pin.display = `${pin.postcode} · ${parent.name}`;
      }
      state.pins.push(pin);
      savePins();
      renderPinnedChips();
      await loadPlace(pin);
      toast(`Pinned ${clean}`);
      // Keep dropdown open so user can pin more codes from the same city.
      const query = $("#city-input").value.trim();
      if (query.length >= 2) fetchSuggestions(query);
    } catch {
      toast(`Could not pin postal code ${clean}`);
    }
  }

  function removePin(id) {
    const idx = state.pins.findIndex((p) => p.id === id);
    if (idx === -1) return;
    state.pins.splice(idx, 1);
    delete state.pinData[id];
    savePins();
    renderPinnedChips();
    renderHero();
    renderWeather();
    renderNotices();
    renderActivePanel();
  }

  /* ── autocomplete ────────────────────────────────────────────────────── */
  async function fetchSuggestions(query) {
    if (acController) acController.abort();
    acController = new AbortController();
    try {
      const res  = await fetch(
        `${API}/api/geocode?q=${encodeURIComponent(query)}&count=8`,
        { signal: acController.signal }
      );
      if (!res.ok) { closeDropdown(); return; }
      const data = await res.json();
      renderDropdown(data.suggestions || []);
    } catch (e) {
      if (e.name !== "AbortError") closeDropdown();
    }
  }

  function renderDropdown(suggestions) {
    const list = $("#autocomplete-list");
    if (!suggestions.length) { closeDropdown(); return; }

    list.innerHTML = "";
    acFocused = -1;

    suggestions.forEach((s) => {
      const isArea = s.kind === "area" && (s.postcodes || []).length > 1;
      const li = document.createElement("li");
      li.className = `ac-item${isArea ? " ac-item--area" : ""}`;
      li.setAttribute("role", "option");

      if (isArea) {
        const codes = s.postcodes || [];
        const codeBtns = codes.map((code) => {
          const pinned = isPostcodePinned(code);
          return `<button type="button" class="ac-item__code-btn${pinned ? " is-pinned" : ""}" data-code="${esc(code)}" ${pinned ? "disabled" : ""}>${pinned ? "✓ " : "+ "}${esc(code)}</button>`;
        }).join("");

        li.innerHTML = `
          <div class="ac-item__info">
            <div class="ac-item__name">${esc(s.name)}</div>
            <div class="ac-item__meta">${esc([s.admin1, s.country].filter(Boolean).join(", "))}</div>
            <div class="ac-item__hint">Pin individual postal codes — not the whole agglomeration</div>
            <div class="ac-item__codes">${codeBtns}</div>
          </div>`;

        li.querySelectorAll(".ac-item__code-btn:not(:disabled)").forEach((btn) => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            addPinFromPostcode(btn.dataset.code, s);
          });
        });
      } else {
        const pin = suggestionToPin(s);
        const isPinned = state.pins.some((p) => p.id === pin.id);
        li.classList.toggle("is-pinned", isPinned);
        li.setAttribute("aria-selected", isPinned ? "true" : "false");

        const label = pin.postcode ? `${pin.postcode} · ${s.name}` : s.name;
        li.innerHTML = `
          <div class="ac-item__info">
            <div class="ac-item__name">${esc(label)}</div>
            <div class="ac-item__meta">${esc([s.admin1, s.country].filter(Boolean).join(", "))}</div>
          </div>
          <button class="ac-item__pin" type="button" ${isPinned ? "disabled" : ""}>${isPinned ? "✓ Pinned" : "+ Pin"}</button>`;

        if (!isPinned) {
          li.querySelector(".ac-item__pin").addEventListener("click", (e) => { e.stopPropagation(); addPin(s); });
          li.addEventListener("click", () => addPin(s));
        }
      }

      list.appendChild(li);
    });

    list.hidden = false;
    $("#city-input").setAttribute("aria-expanded", "true");
  }

  function closeDropdown() {
    const list = $("#autocomplete-list");
    if (list) { list.hidden = true; }
    acFocused = -1;
    const input = $("#city-input");
    if (input) {
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
    }
  }

  function moveFocus(dir) {
    const items = $$("#autocomplete-list .ac-item:not(.is-pinned) .ac-item__pin, #autocomplete-list .ac-item__code-btn:not(:disabled)");
    if (!items.length) return;
    $$("#autocomplete-list .ac-item").forEach((i) => i.classList.remove("is-focused"));
    acFocused = Math.max(-1, Math.min(items.length - 1, acFocused + dir));
    if (acFocused >= 0) {
      items[acFocused].closest(".ac-item")?.classList.add("is-focused");
      items[acFocused].scrollIntoView({ block: "nearest" });
    }
  }

  /* ── data loading ────────────────────────────────────────────────────── */
  async function loadCategories() {
    try {
      const res  = await fetch(`${API}/api/categories`);
      const data = await res.json();
      state.categories = data.categories || [];
    } catch { state.categories = []; }
    renderChips();
  }

  /** Load discover data for a pin that already has lat/lon (skips server geocoding). */
  async function loadPlace(pin) {
    const alreadyHasData = state.pins.some((p) => p.id !== pin.id && state.pinData[p.id]);
    const loadingTimer = alreadyHasData
      ? null
      : setTimeout(() => showLoading(true, `Finding cool things to do in ${pin.name}…`), 220);

    try {
      const placeName = pin.postcode
        ? `${pin.postcode} · ${pin.name}`
        : pin.name;
      const url = `${API}/api/discover?lat=${pin.latitude}&lon=${pin.longitude}&place_name=${encodeURIComponent(placeName)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Could not load this location.");
      }
      const data = await res.json();
      state.pinData[pin.id] = data;
      savePins();
      renderPinnedChips();
      renderHero();
      renderWeather();
      renderNotices();
      renderActivePanel();
    } catch (e) {
      toast(e.message || "Something went wrong");
      removePin(pin.id);
    } finally {
      if (loadingTimer) clearTimeout(loadingTimer);
      showLoading(false);
    }
  }

  /** Load by city name string (legacy path & form fallback — geocodes on the server). */
  async function loadCityName(city) {
    const loadingTimer = setTimeout(
      () => showLoading(true, `Finding cool things to do in ${city}…`), 220
    );
    try {
      const res = await fetch(`${API}/api/discover?city=${encodeURIComponent(city)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Could not load this city.");
      }
      const data  = await res.json();
      const place = data.place;
      const pin   = {
        id:        makePinId(place.latitude, place.longitude),
        name:      place.name,
        display:   [place.name, place.admin, place.country].filter(Boolean).join(", "),
        latitude:  place.latitude,
        longitude: place.longitude,
        postcodes: [],
      };

      // Replace pins only if nothing is loaded yet (avoids clobbering multi-pins)
      if (!state.pins.some((p) => state.pinData[p.id])) {
        state.pins = [pin];
      } else if (!state.pins.some((p) => p.id === pin.id)) {
        state.pins.unshift(pin);
      }

      state.pinData[pin.id] = data;
      savePins();
      renderPinnedChips();
      renderHero();
      renderWeather();
      renderNotices();
      renderActivePanel();
    } catch (e) {
      toast(e.message || "Something went wrong");
    } finally {
      clearTimeout(loadingTimer);
      showLoading(false);
    }
  }

  /* ── UI chrome ───────────────────────────────────────────────────────── */
  function showLoading(on, text) {
    const node = $("#loading");
    if (text) $("#loading-text").textContent = text;
    node.hidden = !on;
  }

  let toastTimer;
  function toast(msg) {
    let t = $(".toast");
    if (!t) { t = el("div", "toast"); document.body.appendChild(t); }
    t.textContent = msg;
    requestAnimationFrame(() => t.classList.add("is-visible"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("is-visible"), 2200);
  }

  function setTab(tab) {
    state.tab = tab;
    $$(".tab").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === tab));
    $$(".panel").forEach((p) => p.classList.toggle("is-active", p.id === `panel-${tab}`));
    renderActivePanel();
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    $("#theme-toggle .theme-toggle__icon").textContent = theme === "dark" ? "☀️" : "🌙";
    store.write(LS.theme, theme);
  }

  /* ── events wiring ───────────────────────────────────────────────────── */
  function wire() {
    // Search form submit
    $("#search-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const query = $("#city-input").value.trim();
      if (!query) return;

      // Keyboard-focused postcode chip or pin button
      const focusedBtn = $("#autocomplete-list .ac-item.is-focused .ac-item__code-btn:not(:disabled), #autocomplete-list .ac-item.is-focused .ac-item__pin:not(:disabled)");
      if (focusedBtn) { focusedBtn.click(); return; }

      // Direct postal-code entry
      if (looksLikePostcode(query)) {
        setTab("discover");
        closeDropdown();
        await addPinFromPostcode(query);
        return;
      }

      // Fall back to the first pinable suggestion if dropdown is visible
      const firstPin = $("#autocomplete-list .ac-item:not(.ac-item--area):not(.is-pinned) .ac-item__pin:not(:disabled)");
      if (firstPin && !$("#autocomplete-list").hidden) { firstPin.click(); return; }

      // City search with multiple postcodes — prompt user to pick codes
      const areaRow = $("#autocomplete-list .ac-item--area");
      if (areaRow && !$("#autocomplete-list").hidden) {
        toast("Select the postal codes you want to include");
        return;
      }

      setTab("discover");
      closeDropdown();
      loadCityName(query);
    });

    // Autocomplete input: debounce & fetch
    const input = $("#city-input");
    input.addEventListener("input", () => {
      const query = input.value.trim();
      clearTimeout(acTimer);
      if (!query || query.length < 2) { closeDropdown(); return; }
      acTimer = setTimeout(() => fetchSuggestions(query), 300);
    });

    // Keyboard navigation in dropdown
    input.addEventListener("keydown", (e) => {
      const list = $("#autocomplete-list");
      if (list.hidden) return;
      if      (e.key === "ArrowDown") { e.preventDefault(); moveFocus(+1); }
      else if (e.key === "ArrowUp")   { e.preventDefault(); moveFocus(-1); }
      else if (e.key === "Escape")    { closeDropdown(); }
    });

    // Close dropdown when clicking outside the search form
    document.addEventListener("click", (e) => {
      if (!e.target.closest("#search-form")) closeDropdown();
    });

    // Tabs
    $$(".tab").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));

    // Kind segmented control
    $$("#kind-filter .seg").forEach((b) =>
      b.addEventListener("click", () => {
        state.filters.kind = b.dataset.kind;
        $$("#kind-filter .seg").forEach((s) => s.classList.toggle("is-active", s === b));
        renderDiscover();
      })
    );

    $("#outdoor-only").addEventListener("change", (e) => {
      state.filters.outdoorOnly = e.target.checked;
      renderDiscover();
    });

    $("#theme-toggle").addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme");
      applyTheme(current === "dark" ? "light" : "dark");
    });
  }

  /* ── init ────────────────────────────────────────────────────────────── */
  function readString(key) {
    let v = localStorage.getItem(key);
    try { v = JSON.parse(v); } catch { /* legacy plain string */ }
    return typeof v === "string" ? v : null;
  }

  function init() {
    let theme = readString(LS.theme);
    if (theme !== "light" && theme !== "dark") {
      theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    applyTheme(theme);

    wire();
    refreshCounts();
    loadCategories();

    // Restore pinned locations (new format) or fall back to legacy lastCity
    const savedPins = readPins();
    if (savedPins) {
      state.pins = savedPins;
      renderPinnedChips();
      renderHero();
      savedPins.forEach((pin) => loadPlace(pin));
    } else {
      const lastCity = readString(LS.city) || "Nantes";
      $("#city-input").value = lastCity;
      loadCityName(lastCity);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
