/* =========================================================================
   CityChilly front-end logic (vanilla JS, no build step)
   ========================================================================= */
(() => {
  "use strict";

  const API = "";
  const LS = {
    theme: "citychilly:theme",
    city: "citychilly:lastCity",
    favorites: "citychilly:favorites",
    agenda: "citychilly:agenda",
  };

  const state = {
    place: null,
    weather: { days: [] },
    activities: [],
    events: [],
    notices: [],
    categories: [],
    filters: { category: "all", kind: "all", outdoorOnly: false },
    tab: "discover",
  };

  /* ---------- tiny helpers ---------- */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  const store = {
    read(key) {
      try { return JSON.parse(localStorage.getItem(key)) || {}; }
      catch { return {}; }
    },
    write(key, val) { localStorage.setItem(key, JSON.stringify(val)); },
  };

  const catMeta = (id) =>
    state.categories.find((c) => c.id === id) || { label: id, emoji: "✨" };

  /* ---------- dates ---------- */
  const fmtDay = (iso) => {
    if (!iso) return null;
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  };
  const fmtRange = (start, end) => {
    if (!start) return "Anytime";
    if (!end || end === start) return fmtDay(start);
    return `${fmtDay(start)} – ${fmtDay(end)}`;
  };

  /* ---------- weather ---------- */
  const wxLevel = (score) => (score >= 70 ? "good" : score >= 45 ? "ok" : "bad");
  const wxLabel = (score) => (score >= 70 ? "Great outdoors" : score >= 45 ? "Bring a layer" : "Better indoors");

  function renderWeather() {
    const strip = $("#weather-strip");
    strip.innerHTML = "";
    state.weather.days.slice(0, 8).forEach((d, i) => {
      const node = el("div", "wx-day");
      const name = i === 0 ? "Today" :
        new Date(d.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" });
      const tmax = d.temp_max != null ? Math.round(d.temp_max) : "–";
      const tmin = d.temp_min != null ? Math.round(d.temp_min) : "–";
      node.innerHTML = `
        <div class="wx-day__name">${esc(name)}</div>
        <div class="wx-day__icon" title="${esc(d.summary)}">${d.emoji}</div>
        <div class="wx-day__temp">${tmax}°<small> / ${tmin}°</small></div>`;
      strip.appendChild(node);
    });
  }

  /* ---------- favorites & agenda ---------- */
  const favorites = () => store.read(LS.favorites);
  const agenda = () => store.read(LS.agenda);
  const isFav = (id) => Boolean(favorites()[id]);
  const inAgenda = (id) => Boolean(agenda()[id]);

  function toggleFav(item) {
    const f = favorites();
    if (f[item.id]) { delete f[item.id]; toast("Removed from favorites"); }
    else { f[item.id] = item; toast("Saved to favorites ❤️"); }
    store.write(LS.favorites, f);
    refreshCounts();
    renderActivePanel();
  }

  function toggleAgenda(item) {
    const a = agenda();
    if (a[item.id]) { delete a[item.id]; toast("Removed from agenda"); }
    else { a[item.id] = item; toast("Added to your agenda 🗓️"); }
    store.write(LS.agenda, a);
    refreshCounts();
    renderActivePanel();
  }

  function refreshCounts() {
    $("#fav-count").textContent = Object.keys(favorites()).length;
    $("#agenda-count").textContent = Object.keys(agenda()).length;
  }

  /* ---------- card ---------- */
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

    const body = el("div", "card__body");

    const metaBits = [];
    if (item.kind === "event") metaBits.push(`<span>🗓️ ${esc(fmtRange(item.start, item.end))}</span>`);
    if (item.location_name) metaBits.push(`<span>📍 ${esc(item.location_name)}</span>`);
    metaBits.push(`<span>${meta.emoji} ${esc(meta.label)}</span>`);

    let wxBadge = "";
    if (item.weather) {
      const lvl = wxLevel(item.weather.outdoor_score);
      const t = item.weather.temp_max != null ? ` · ${Math.round(item.weather.temp_max)}°` : "";
      wxBadge = `<span class="wx-badge" data-level="${lvl}">${item.weather.emoji} ${esc(wxLabel(item.weather.outdoor_score))}${t}</span>`;
    }

    body.innerHTML = `
      <h3 class="card__title">${esc(item.title)}</h3>
      ${item.description ? `<p class="card__desc">${esc(item.description)}</p>` : ""}
      ${wxBadge}
      <div class="card__meta">${metaBits.join("")}</div>`;

    const actions = el("div", "card__actions");
    const agendaBtn = el(
      "button",
      `btn ${inAgenda(item.id) ? "btn--in-agenda" : "btn--primary"}`,
      inAgenda(item.id) ? "✓ In agenda" : "+ Add to agenda"
    );
    agendaBtn.addEventListener("click", () => toggleAgenda(item));

    const source = el("a", "btn btn--ghost btn--source");
    source.href = item.source_url;
    source.target = "_blank";
    source.rel = "noopener";
    source.title = `Source: ${item.source_name}`;
    source.innerHTML = "↗ Source";

    actions.append(agendaBtn, source);
    body.appendChild(actions);
    node.append(media, body);
    return node;
  }

  /* ---------- discover ---------- */
  function filteredItems() {
    const { category, kind, outdoorOnly } = state.filters;
    let items = [];
    if (kind === "all") items = [...state.events, ...state.activities];
    else if (kind === "event") items = [...state.events];
    else items = [...state.activities];

    return items.filter((it) => {
      if (category !== "all" && it.category !== category) return false;
      if (outdoorOnly && !it.is_outdoor) return false;
      return true;
    });
  }

  function renderDiscover() {
    const grid = $("#discover-grid");
    const empty = $("#discover-empty");
    const meta = $("#results-meta");
    grid.innerHTML = "";
    const items = filteredItems();

    meta.textContent = `${items.length} result${items.length === 1 ? "" : "s"} in ${state.place ? state.place.name : "your city"}`;

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

  /* ---------- favorites ---------- */
  function renderFavorites() {
    const grid = $("#favorites-grid");
    const empty = $("#favorites-empty");
    const items = Object.values(favorites());
    grid.innerHTML = "";
    if (!items.length) { empty.hidden = false; return; }
    empty.hidden = true;
    const frag = document.createDocumentFragment();
    items.forEach((it) => frag.appendChild(card(it)));
    grid.appendChild(frag);
  }

  /* ---------- agenda ---------- */
  function renderAgenda() {
    const list = $("#agenda-list");
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
      const label = key === "Anytime" ? "Anytime / flexible" : fmtDay(key);
      const head = el("h3", "agenda__date", `${esc(label)} <span class="pill">${groups[key].length} planned</span>`);
      dayBlock.appendChild(head);

      groups[key].forEach((it) => {
        const meta = catMeta(it.category);
        const row = el("div", "agenda__row");
        const sub = [it.location_name, meta.label].filter(Boolean).map(esc).join(" · ");
        row.innerHTML = `
          <div class="agenda__emoji cat-${esc(it.category)}">${meta.emoji}</div>
          <div class="agenda__info">
            <p class="agenda__title">${esc(it.title)}</p>
            <p class="agenda__sub">${sub}</p>
          </div>`;
        const actions = el("div", "agenda__actions");
        const src = el("a", "btn btn--ghost");
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
    if (state.tab === "discover") renderDiscover();
    else if (state.tab === "favorites") renderFavorites();
    else if (state.tab === "agenda") renderAgenda();
  }

  /* ---------- notices ---------- */
  function renderNotices() {
    const box = $("#notices");
    box.innerHTML = "";
    if (!state.notices.length) { box.hidden = true; return; }
    box.hidden = false;
    state.notices.forEach((n) => box.appendChild(el("div", "notice", `💡 ${esc(n)}`)));
  }

  /* ---------- chips ---------- */
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

  /* ---------- data loading ---------- */
  async function loadCategories() {
    try {
      const res = await fetch(`${API}/api/categories`);
      const data = await res.json();
      state.categories = data.categories || [];
    } catch { state.categories = []; }
    renderChips();
  }

  let loadingTimer;
  async function loadCity(city) {
    clearTimeout(loadingTimer);
    loadingTimer = setTimeout(
      () => showLoading(true, `Finding cool things to do in ${city}…`),
      220
    );
    try {
      const res = await fetch(`${API}/api/discover?city=${encodeURIComponent(city)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Could not load this city.");
      }
      const data = await res.json();
      state.place = data.place;
      state.weather = data.weather || { days: [] };
      state.activities = data.activities || [];
      state.events = data.events || [];
      state.notices = data.notices || [];

      $("#place-name").textContent = data.place.name;
      $("#place-sub").textContent = [data.place.admin, data.place.country].filter(Boolean).join(", ");
      store.write(LS.city, data.place.name);

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

  /* ---------- UI chrome ---------- */
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

  /* ---------- events wiring ---------- */
  function wire() {
    $("#search-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const city = $("#city-input").value.trim();
      if (city) { setTab("discover"); loadCity(city); }
    });

    $$(".tab").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));

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

  /* ---------- init ---------- */
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

    const city = readString(LS.city) || "Nantes";
    $("#city-input").value = city;
    loadCity(city);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
