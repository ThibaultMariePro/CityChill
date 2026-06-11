/* =========================================================================
   CityChilly front-end logic (vanilla JS, no build step)
   ========================================================================= */
(() => {
  "use strict";

  const I18N = window.CityChillyI18n || {
    t: (key) => key,
    getLang: () => "fr",
    setLang: () => "fr",
    applyStatic: () => {},
    translateKeyword: (word) => word,
    dateLocale: () => "en-GB",
    formatDay: (iso) => iso || "",
    formatWeekday: (iso) => iso || "",
    formatDateTime: (d) => String(d),
    formatRange: (start, end) => end && end !== start ? `${start} – ${end}` : (start || ""),
    SUPPORTED: ["en", "fr"],
  };
  const t = (key, vars) => I18N.t(key, vars);
  const getLang = () => I18N.getLang();
  const translateKeyword = (word) => I18N.translateKeyword(word);
  const fmtDay = (iso) => I18N.formatDay(iso);
  const fmtRange = (start, end) => {
    if (!start) return t("card.anytime");
    return I18N.formatRange(start, end);
  };

  const API = "";
  const DISCOVER_PAGE_SIZE = 40;
  let defaultCountry = "France";
  const LS = {
    theme:     "citychilly:theme",
    city:      "citychilly:lastCity",   // legacy – read for migration only
    pins:      "citychilly:pins",       // new multi-pin storage
    favorites: "citychilly:favorites",
    agenda:    "citychilly:agenda",
    params:           "citychilly:params",
    palette:          "citychilly:palette",
    lang:             "citychilly:lang",
    dismissedNotices: "citychilly:dismissedNotices",
    liveEventsOnly: "citychilly:liveEventsOnly",
    hotToday: "citychilly:hotToday",
    hotWeek: "citychilly:hotWeek",
  };

  /* ── state ───────────────────────────────────────────────────────────── */
  const state = {
    // Multi-pin: each entry is a lightweight PlaceSuggestion-like object
    pins:    [],   // [{id, name, display, latitude, longitude, postcodes}]
    pinData: {},   // id → DiscoverResponse (place, weather, activities, events, notices)
    // UI
    categories: [],
    filters: { category: "all", kind: "all", outdoorOnly: false, eventPeriod: "all", liveEventsOnly: false },
    openagendaEnabled: false,
    serverOpenAgendaConfigured: false,
    connectionOk: null,
    refreshInFlight: false,
    loadMoreInFlight: false,
    oaRenderRetry: false,
    tab: "discover",
    keySpecs: [],
    themePalettes: [],
    activePalette: null,
    serverPalette: null,
    apiBootstrapped: false,
  };

  let apiBootstrapPromise = null;

  async function ensureApiBootstrap() {
    if (state.apiBootstrapped) return;
    if (!apiBootstrapPromise) {
      apiBootstrapPromise = (async () => {
        await Promise.all([loadThemePalettes(), loadKeySpecs(), loadCategories()]);
        const savedPal = readString(LS.palette);
        if (savedPal && state.themePalettes.some((p) => p.id === savedPal)) {
          applyPalette(savedPal, { save: false });
        } else if (state.serverPalette) {
          state.activePalette = state.serverPalette;
        }
        renderLanguagePicker();
        renderParameters();
        purgeBrowserKeyWhenServerConfigured();
        if (state.filters.liveEventsOnly && state.filters.kind === "all") {
          state.filters.kind = "event";
        }
        syncKindFilterUI();
        renderLiveEventsToggle();
        state.apiBootstrapped = true;
      })();
    }
    await apiBootstrapPromise;
  }

  // Autocomplete state
  let acTimer        = null;
  let acFocused      = -1;
  let acController   = null;
  let acSuggestions  = [];
  let loadGeneration = 0;

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

  function isAreaFullyPinned(suggestion) {
    const codes = suggestion?.postcodes || [];
    return codes.length > 0 && codes.every((code) => isPostcodePinned(code));
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

  function itemKeyword(item) {
    let word;
    if (item.keyword) word = item.keyword;
    else {
      const meta = catMeta(item.category);
      word = item.kind === "event" ? meta.label.split(" & ")[0] : meta.label;
    }
    return translateKeyword(word);
  }

  function fmtEventDateMeta(item) {
    if (item.kind !== "event") return "";
    if (isHotWeekActive()) {
      const end = item.end || item.start;
      if (end) {
        return `<span class="card__date card__date--ends">🗓️ ${esc(t("card.ends", { day: fmtDay(end) }))}</span>`;
      }
    }
    return `<span>🗓️ ${esc(fmtRange(item.start, item.end))}</span>`;
  }

  const parseISODate = (iso) => {
    const [y, m, d] = String(iso).split("T")[0].split("-").map(Number);
    return new Date(y, m - 1, d);
  };

  const isoDateOnly = (iso) => String(iso || "").split("T")[0];

  const localTodayISO = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const addDaysISO = (iso, days) => {
    const d = parseISODate(iso);
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  /** True when the event is exactly one day long and that day is `dayIso`. */
  const eventIsSingleDayOn = (item, dayIso) => {
    const start = isoDateOnly(item.start);
    if (!start) return false;
    const end = isoDateOnly(item.end || item.start);
    return start === end && start === dayIso;
  };

  /** True when the event end date falls within the next 7 days (today inclusive). */
  const eventEndsWithinNextSevenDays = (item) => {
    const endIso = isoDateOnly(item.end || item.start);
    if (!endIso) return false;
    const today = localTodayISO();
    const lastDay = addDaysISO(today, 6);
    return endIso >= today && endIso <= lastDay;
  };

  const startOfWeek = (ref = new Date()) => {
    const date = new Date(ref);
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + diff);
    date.setHours(0, 0, 0, 0);
    return date;
  };

  const endOfWeek = (ref = new Date()) => {
    const end = startOfWeek(ref);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
  };

  const startOfMonth = (ref = new Date()) =>
    new Date(ref.getFullYear(), ref.getMonth(), 1);

  const endOfMonth = (ref = new Date()) =>
    new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59, 999);

  const eventPeriodBounds = (period) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (period === "today") {
      const end = new Date(today);
      end.setHours(23, 59, 59, 999);
      return { start: today, end };
    }
    if (period === "week") {
      return { start: startOfWeek(today), end: endOfWeek(today) };
    }
    if (period === "month") {
      return { start: startOfMonth(today), end: endOfMonth(today) };
    }
    if (period === "quarter") {
      const end = new Date(today);
      end.setMonth(end.getMonth() + 3);
      end.setHours(23, 59, 59, 999);
      return { start: today, end };
    }
    return null;
  };

  const eventMatchesPeriod = (item, period) => {
    if (period === "all" || item.kind !== "event") return true;
    if (!item.start) return false;
    if (period === "today") {
      return eventIsSingleDayOn(item, localTodayISO());
    }
    if (period === "hot_week") {
      return eventEndsWithinNextSevenDays(item);
    }
    const bounds = eventPeriodBounds(period);
    if (!bounds) return true;
    const evStart = parseISODate(item.start);
    const evEnd = parseISODate(item.end || item.start);
    return evStart <= bounds.end && evEnd >= bounds.start;
  };

  const wxLevel = (score) => (score >= 70 ? "good" : score >= 45 ? "ok" : "bad");
  const wxLabel = (score) => (
    score >= 70 ? t("wx.great") : score >= 45 ? t("wx.layer") : t("wx.indoors")
  );

  function appendLangToSearchParams(sp) {
    sp.set("lang", getLang());
    return sp;
  }

  function googleMapsUrl(item) {
    const hasCoords = item.latitude != null && item.longitude != null;
    if (hasCoords) {
      return `https://www.google.com/maps/search/?api=1&query=${item.latitude},${item.longitude}`;
    }
    const parts = [item.title, item.location_name].filter(Boolean);
    if (!parts.length) return null;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(", "))}`;
  }

  /** Build a web-search query from the card title and venue/location. */
  function searchQueryForItem(item) {
    const title = String(item?.title || "").trim();
    if (!title) return null;
    const location = String(item?.location_name || "").trim();
    if (!location) return title;
    const titleLow = title.toLowerCase();
    const locLow = location.toLowerCase();
    if (titleLow.includes(locLow) || locLow.includes(titleLow)) return title;
    return `${title}, ${location}`;
  }

  function searchEngineUrlForItem(item) {
    const q = searchQueryForItem(item);
    if (!q) return null;
    return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }

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
        ? t("weather.today")
        : I18N.formatWeekday(d.date);
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
    if (!state.pins.length) return;
    const eyebrow = $("#place-eyebrow");
    if (eyebrow) eyebrow.hidden = false;
    const codes = state.pins.map((p) => p.postcode).filter(Boolean);
    const placeSub = $("#place-sub");
    if (codes.length) {
      const places = [...new Set(state.pins.map((p) => p.name).filter(Boolean))];
      $("#place-name").textContent = places.join(" · ");
      placeSub.textContent = codes.join(" · ");
      placeSub.classList.add("hero__subtitle--codes");
      if (eyebrow) eyebrow.textContent = t("hero.postcodes");
    } else if (state.pins.length === 1) {
      const pin = state.pins[0];
      const place = state.pinData[pin.id]?.place;
      $("#place-name").textContent = place?.name || pin.name;
      placeSub.textContent = place
        ? [place.admin, place.country].filter(Boolean).join(", ")
        : (pin.display || "");
      placeSub.classList.remove("hero__subtitle--codes");
      if (eyebrow) eyebrow.textContent = t("hero.exploring");
    } else {
      const names = state.pins.map((p) => state.pinData[p.id]?.place?.name || p.name);
      $("#place-name").textContent = t("hero.locations", { count: state.pins.length });
      placeSub.textContent = names.join(" · ");
      placeSub.classList.remove("hero__subtitle--codes");
      if (eyebrow) eyebrow.textContent = t("hero.exploring");
    }
  }

  /* ── warnings / notices ──────────────────────────────────────────────── */
  function noticeId(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    return `n:${(hash >>> 0).toString(36)}`;
  }

  function readDismissedNotices() {
    try {
      const raw = localStorage.getItem(LS.dismissedNotices);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  }

  function dismissNotice(text) {
    const dismissed = readDismissedNotices();
    dismissed.add(noticeId(text));
    localStorage.setItem(LS.dismissedNotices, JSON.stringify([...dismissed]));
    renderWarnings();
  }

  function allNotices() {
    const dismissed = readDismissedNotices();
    const seen = new Set();
    const out  = [];
    for (const pin of state.pins) {
      for (const n of state.pinData[pin.id]?.notices ?? []) {
        if (seen.has(n) || dismissed.has(noticeId(n))) continue;
        seen.add(n);
        out.push(n);
      }
    }
    return out;
  }

  function refreshWarningsTab() {
    const count = allNotices().length;
    const badge = $("#warnings-count");
    const tab = document.querySelector('.tab[data-tab="warnings"]');
    if (badge) {
      badge.textContent = String(count);
      badge.hidden = count === 0;
    }
    if (tab) tab.hidden = count === 0;
    if (count === 0 && state.tab === "warnings") setTab("discover");
  }

  function renderWarnings() {
    const list  = $("#warnings-list");
    const empty = $("#warnings-empty");
    if (!list) return;

    const notices = allNotices();
    list.innerHTML = "";

    if (!notices.length) {
      if (empty) empty.hidden = false;
      refreshWarningsTab();
      return;
    }
    if (empty) empty.hidden = true;

    notices.forEach((n) => {
      const row = el("button", "warning-item");
      row.type = "button";
      row.title = t("panel.warnings.hint");
      row.innerHTML = `
        <span class="warning-item__icon" aria-hidden="true">⚠️</span>
        <span class="warning-item__text">${esc(n)}</span>
        <span class="warning-item__close" aria-hidden="true">×</span>`;
      row.addEventListener("click", () => {
        dismissNotice(n);
        toast(t("toast.warningDismissed"));
      });
      list.appendChild(row);
    });

    refreshWarningsTab();
  }

  /* ── favorites & agenda ──────────────────────────────────────────────── */
  const favorites = () => store.read(LS.favorites);
  const agenda    = () => store.read(LS.agenda);
  const isFav     = (id) => Boolean(favorites()[id]);
  const inAgenda  = (id) => Boolean(agenda()[id]);

  function toggleFav(item) {
    const f = favorites();
    if (f[item.id]) { delete f[item.id]; toast(t("toast.favRemoved")); }
    else            { f[item.id] = item;  toast(t("toast.favSaved")); }
    store.write(LS.favorites, f);
    refreshCounts();
    renderActivePanel();
  }

  function toggleAgenda(item) {
    const a = agenda();
    if (a[item.id]) { delete a[item.id]; toast(t("toast.agendaRemoved")); }
    else            { a[item.id] = item;  toast(t("toast.agendaAdded")); }
    store.write(LS.agenda, a);
    refreshCounts();
    renderActivePanel();
  }

  function refreshCounts() {
    $("#fav-count").textContent    = Object.keys(favorites()).length;
    $("#agenda-count").textContent = Object.keys(agenda()).length;
  }

  const isLiveEvent = (item) =>
    item.kind === "event" && (item.tags || []).includes("openagenda");

  const isCuratedEvent = (item) =>
    item.kind === "event"
    && (item.tags || []).includes("curated")
    && !isLiveEvent(item);

  function rawDiscoverCounts() {
    const counts = { live: 0, curated: 0, activities: 0 };
    for (const pin of state.pins) {
      const data = state.pinData[pin.id];
      if (!data) continue;
      for (const item of data.activities ?? []) {
        if (item.kind === "activity") counts.activities += 1;
      }
      for (const item of data.events ?? []) {
        if (item.kind !== "event") continue;
        if (isLiveEvent(item)) counts.live += 1;
        else if ((item.tags || []).includes("curated")) counts.curated += 1;
      }
    }
    return counts;
  }

  /* ── card ────────────────────────────────────────────────────────────── */
  function card(item) {
    const meta = catMeta(item.category);
    const node = el("article", "card");
    node.dataset.id = item.id;

    const media = el("div", `card__media cat-${esc(item.category)}`);
    const keyword = itemKeyword(item);
    const liveHint = isLiveEvent(item)
      ? `<span class="card__live-hint" title="${esc(t("card.liveHint"))}" aria-label="${esc(t("card.liveHint"))}">Live</span>`
      : "";
    const curatedHint = isCuratedEvent(item)
      ? `<span class="card__curated-hint" title="${esc(t("card.curatedHint"))}" aria-label="${esc(t("card.curatedHint"))}">ℹ️</span>`
      : "";
    media.innerHTML = `
      <div class="card__topbar">
        <div class="card__header">
          <span class="card__emoji" aria-hidden="true">${meta.emoji}</span>
          <p class="card__keyword">${esc(keyword)}</p>
          ${liveHint}
          ${curatedHint}
        </div>
        <button class="card__fav ${isFav(item.id) ? "is-active" : ""}" title="${esc(t("card.fav"))}" aria-label="${esc(t("card.fav"))}">
          ${isFav(item.id) ? "❤️" : "🤍"}
        </button>
      </div>
      <span class="card__kind">${item.kind === "event" ? t("card.event") : t("card.activity")}</span>`;
    media.querySelector(".card__fav").addEventListener("click", () => toggleFav(item));

    const body    = el("div", "card__body");
    const metaBits = [];
    if (item.kind === "event") metaBits.push(fmtEventDateMeta(item));
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
      inAgenda(item.id) ? t("card.inAgenda") : t("card.addAgenda")
    );
    agendaBtn.addEventListener("click", () => toggleAgenda(item));
    actions.append(agendaBtn);

    const utilityRow = el("div", "card__actions card__actions--utility");
    const mapsUrl = googleMapsUrl(item);

    if (mapsUrl) {
      const mapsLink = el("a", "btn btn--ghost btn--compact");
      mapsLink.href = mapsUrl;
      mapsLink.target = "_blank";
      mapsLink.rel = "noopener";
      mapsLink.title = t("card.mapsTitle");
      mapsLink.innerHTML = t("card.location");

      const copyMap = el("button", "btn btn--ghost btn--compact", t("card.link"));
      copyMap.type = "button";
      copyMap.title = t("card.linkTitle");
      copyMap.addEventListener("click", async () => {
        try {
          await copyText(mapsUrl);
          toast(t("toast.mapsCopied"));
        } catch {
          toast(t("toast.mapsCopyFail"));
        }
      });

      utilityRow.append(mapsLink, copyMap);
    }

    const searchQuery = searchQueryForItem(item);
    const searchUrl = searchEngineUrlForItem(item);
    if (searchUrl) {
      const searchLink = el("a", "btn btn--ghost btn--compact");
      searchLink.href = searchUrl;
      searchLink.target = "_blank";
      searchLink.rel = "noopener";
      searchLink.title = t("card.searchTitle", { query: searchQuery });
      searchLink.innerHTML = t("card.search");
      utilityRow.append(searchLink);
    }

    const source = el("a", "btn btn--ghost btn--compact btn--source");
    source.href    = item.source_url;
    source.target  = "_blank";
    source.rel     = "noopener";
    source.title   = t("card.sourceTitle", { name: item.source_name });
    source.innerHTML = t("card.source");
    utilityRow.append(source);

    body.append(actions, utilityRow);
    node.append(media, body);
    return node;
  }

  /* ── items merging ───────────────────────────────────────────────────── */
  function prunePinData() {
    const active = new Set(state.pins.map((p) => p.id));
    for (const id of Object.keys(state.pinData)) {
      if (!active.has(id)) delete state.pinData[id];
    }
  }

  function clearResults() {
    const eyebrow = $("#place-eyebrow");
    if (eyebrow) {
      eyebrow.textContent = "";
      eyebrow.hidden = true;
    }
    $("#place-name").textContent = t("hero.pick");
    const placeSub = $("#place-sub");
    placeSub.textContent = t("hero.searchHint");
    placeSub.classList.remove("hero__subtitle--codes");
    $("#weather-strip").innerHTML = "";
    renderWarnings();
    $("#discover-grid").innerHTML = "";
    const empty = $("#discover-empty");
    empty.hidden = false;
    empty.innerHTML = `<div class="empty__emoji">📍</div><h3>${esc(t("empty.noPins.title"))}</h3><p>${esc(t("empty.noPins.body"))}</p>`;
    $("#results-meta").textContent = t("results.zero");
    updateRefreshButton();
    updateLoadMoreButton();
  }

  function allItems() {
    const seen  = new Set();
    const items = [];
    const activeIds = new Set(state.pins.map((p) => p.id));
    for (const pin of state.pins) {
      if (!activeIds.has(pin.id)) continue;
      const data = state.pinData[pin.id];
      if (!data) continue;
      for (const item of [...(data.events ?? []), ...(data.activities ?? [])]) {
        if (!seen.has(item.id)) { seen.add(item.id); items.push(item); }
      }
    }
    return items;
  }

  const eventEndSortKey = (item) => isoDateOnly(item.end || item.start) || "9999-12-31";

  const eventStartSortKey = (item) => isoDateOnly(item.start) || "9999-12-31";

  function sortDiscoverItems(items) {
    return [...items].sort((a, b) => {
      if (a.kind === "event" && b.kind === "event") {
        const byEnd = eventEndSortKey(a).localeCompare(eventEndSortKey(b));
        if (byEnd !== 0) return byEnd;
        const byStart = eventStartSortKey(a).localeCompare(eventStartSortKey(b));
        if (byStart !== 0) return byStart;
        return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
      }
      if (a.kind === "event") return -1;
      if (b.kind === "event") return 1;
      return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    });
  }

  function filteredItems() {
    const { category, kind, outdoorOnly, eventPeriod } = state.filters;
    let items = allItems();
    if (kind !== "all")     items = items.filter((it) => it.kind === kind);
    if (category !== "all") items = items.filter((it) => it.category === category);
    if (outdoorOnly)        items = items.filter((it) => it.is_outdoor);
    if (eventPeriod !== "all") {
      items = items.filter((it) => eventMatchesPeriod(it, eventPeriod));
    }
    if (state.filters.liveEventsOnly) {
      items = items.filter(
        (it) => it.kind !== "event" || (it.tags || []).includes("openagenda")
      );
    }
    return sortDiscoverItems(items);
  }

  /* ── discover ────────────────────────────────────────────────────────── */
  function renderDiscover() {
    const grid  = $("#discover-grid");
    const empty = $("#discover-empty");
    const meta  = $("#results-meta");
    const hint  = $("#results-filter-hint");
    grid.innerHTML = "";

    if (!state.pins.length) {
      empty.hidden = false;
      empty.innerHTML = `<div class="empty__emoji">📍</div><h3>${esc(t("empty.noPins.title"))}</h3><p>${esc(t("empty.noPins.body"))}</p>`;
      meta.textContent = t("results.zero");
      if (hint) {
        hint.hidden = true;
        hint.textContent = "";
      }
      updateLoadMoreButton();
      return;
    }

    const raw = rawDiscoverCounts();
    if (
      !state.oaRenderRetry
      && !state.refreshInFlight
      && raw.live === 0
      && raw.curated > 0
      && (serverHasOpenAgendaKey() || state.connectionOk)
      && state.pins.every((p) => state.pinData[p.id])
    ) {
      state.oaRenderRetry = true;
      reloadSelection({ refresh: true, oaRetry: true });
      return;
    }

    const items   = filteredItems();
    const loaded  = state.pins.filter((p) => state.pinData[p.id]);
    const codes = state.pins.map((p) => p.postcode).filter(Boolean);
    const locText = codes.length
      ? codes.join(", ")
      : loaded.length > 1
        ? `${loaded.length} locations`
        : (loaded[0] ? (state.pinData[loaded[0].id]?.place?.name || loaded[0].name) : t("results.yourCity"));

    const headline = items.length === 1
      ? t("results.count", { count: items.length, place: locText })
      : t("results.countPlural", { count: items.length, place: locText });
    const breakdown = [];
    if (raw.live) breakdown.push(t("results.live", { count: raw.live }));
    if (raw.curated) breakdown.push(t("results.curated", { count: raw.curated }));
    if (raw.activities) breakdown.push(t("results.activities", { count: raw.activities }));
    const loadedTotal = discoverLoadedTotal();
    const upstreamTotal = discoverUpstreamTotal();
    const loadDetail = upstreamTotal > loadedTotal
      ? t("results.loadedOf", { loaded: loadedTotal, total: upstreamTotal })
      : "";
    const detailParts = [...breakdown];
    if (loadDetail) detailParts.push(loadDetail);
    meta.innerHTML = detailParts.length
      ? `${esc(headline)}<span class="results-meta__detail">${esc(detailParts.join(" · "))}</span>`
      : esc(headline);

    const shownLive = items.filter((it) => isLiveEvent(it)).length;
    if (hint) {
      if (raw.live > 0 && shownLive === 0) {
        hint.hidden = false;
        hint.textContent = t("results.filterHidesLive", { count: raw.live });
      } else {
        hint.hidden = true;
        hint.textContent = "";
      }
    }

    if (!items.length) {
      empty.hidden = false;
      const moreHint = discoverHasMore()
        ? `<p class="empty__more-hint">${esc(t("results.loadMore"))}</p>`
        : "";
      empty.innerHTML = `<div class="empty__emoji">🧐</div><h3>${esc(t("empty.noFilter.title"))}</h3><p>${esc(t("empty.noFilter.body"))}</p>${moreHint}`;
      updateLoadMoreButton();
      return;
    }
    empty.hidden = true;
    const frag = document.createDocumentFragment();
    items.forEach((it) => frag.appendChild(card(it)));
    grid.appendChild(frag);
    updateLoadMoreButton();
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

  /* ── agenda export ───────────────────────────────────────────────────── */
  function groupAgendaItems(items) {
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
    return { groups, keys };
  }

  function agendaDayLabel(key) {
    return key === "Anytime" ? t("agenda.anytime") : fmtDay(key);
  }

  function googleCalendarUrl(item) {
    if (!item.start) return null;
    const start = item.start.replace(/-/g, "");
    const endIso = item.end && item.end !== item.start ? item.end : item.start;
    const endDate = new Date(endIso + "T00:00:00");
    endDate.setDate(endDate.getDate() + 1);
    const end = endDate.toISOString().slice(0, 10).replace(/-/g, "");

    const params = new URLSearchParams();
    params.set("action", "TEMPLATE");
    params.set("text", item.title);
    params.set("dates", `${start}/${end}`);

    const details = [
      itemKeyword(item),
      item.description,
      item.source_url ? `Source: ${item.source_url}` : null,
    ].filter(Boolean).join("\n\n");
    if (details) params.set("details", details);

    const location = item.location_name || "";
    if (location) params.set("location", location);

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  function icsEscape(value) {
    return String(value ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r?\n/g, "\\n");
  }

  function icsStamp() {
    return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  }

  function icsDayAfter(iso) {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10).replace(/-/g, "");
  }

  function buildAgendaPlainText() {
    const items = Object.values(agenda());
    const { groups, keys } = groupAgendaItems(items);
    const lines = [
      "CityChilly — My Agenda",
      `Exported ${I18N.formatDateTime(new Date())}`,
      "",
    ];

    keys.forEach((key) => {
      lines.push(agendaDayLabel(key));
      groups[key].forEach((it) => {
        const meta = catMeta(it.category);
        const type = itemKeyword(it);
        lines.push(`• ${it.title} (${type})`);
        const bits = [it.location_name, meta.label].filter(Boolean);
        if (bits.length) lines.push(`  ${bits.join(" · ")}`);
        const maps = googleMapsUrl(it);
        if (maps) lines.push(`  Maps: ${maps}`);
        if (it.source_url) lines.push(`  Source: ${it.source_url}`);
        const gcal = googleCalendarUrl(it);
        if (gcal) lines.push(`  Google Calendar: ${gcal}`);
        lines.push("");
      });
    });

    return lines.join("\n").trim() + "\n";
  }

  function buildAgendaICS() {
    const items = Object.values(agenda());
    const dated = items.filter((it) => it.start);
    const anytime = items.filter((it) => !it.start);
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//CityChilly//Agenda//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
    ];

    dated.forEach((it) => {
      const start = it.start.replace(/-/g, "");
      const end = it.end && it.end !== it.start
        ? icsDayAfter(it.end)
        : icsDayAfter(it.start);
      const details = [
        itemKeyword(it),
        it.description,
        googleMapsUrl(it) ? `Maps: ${googleMapsUrl(it)}` : null,
        it.source_url ? `Source: ${it.source_url}` : null,
      ].filter(Boolean).join("\\n");

      lines.push(
        "BEGIN:VEVENT",
        `UID:${icsEscape(it.id)}@citychilly`,
        `DTSTAMP:${icsStamp()}`,
        `DTSTART;VALUE=DATE:${start}`,
        `DTEND;VALUE=DATE:${end}`,
        `SUMMARY:${icsEscape(it.title)}`,
      );
      if (it.location_name) lines.push(`LOCATION:${icsEscape(it.location_name)}`);
      if (details) lines.push(`DESCRIPTION:${icsEscape(details)}`);
      if (it.source_url) lines.push(`URL:${icsEscape(it.source_url)}`);
      lines.push("END:VEVENT");
    });

    if (anytime.length) {
      const note = anytime.map((it) => `• ${it.title}`).join("\n");
      lines.push(
        "BEGIN:VTODO",
        `UID:anytime-${icsStamp()}@citychilly`,
        `DTSTAMP:${icsStamp()}`,
        "SUMMARY:Anytime / flexible (CityChilly)",
        `DESCRIPTION:${icsEscape(`These activities have no fixed date:\n${note}`)}`,
        "END:VTODO",
      );
    }

    lines.push("END:VCALENDAR");
    return lines.join("\r\n") + "\r\n";
  }

  function buildAgendaJSON() {
    return JSON.stringify(
      {
        app: "CityChilly",
        exported_at: new Date().toISOString(),
        count: Object.keys(agenda()).length,
        items: Object.values(agenda()),
      },
      null,
      2,
    );
  }

  function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function updateAgendaExportBar() {
    const bar = $("#agenda-export");
    if (bar) bar.hidden = !Object.keys(agenda()).length;
  }

  /* ── agenda ──────────────────────────────────────────────────────────── */
  function renderAgenda() {
    const list  = $("#agenda-list");
    const empty = $("#agenda-empty");
    const items = Object.values(agenda());
    list.innerHTML = "";
    updateAgendaExportBar();
    if (!items.length) { empty.hidden = false; return; }
    empty.hidden = true;

    const { groups, keys } = groupAgendaItems(items);

    keys.forEach((key) => {
      const dayBlock = el("div", "agenda__day");
      const label    = agendaDayLabel(key);
      const head     = el("h3", "agenda__date", `${esc(label)} <span class="pill">${t("agenda.planned", { count: groups[key].length })}</span>`);
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
        const gcalUrl = googleCalendarUrl(it);
        if (gcalUrl) {
          const gcal = el("a", "btn btn--ghost btn--compact");
          gcal.href = gcalUrl;
          gcal.target = "_blank";
          gcal.rel = "noopener";
          gcal.title = t("agenda.gcalTitle");
          gcal.innerHTML = t("agenda.gcal");
          actions.append(gcal);
        }
        const mapsUrl = googleMapsUrl(it);
        if (mapsUrl) {
          const mapsLink = el("a", "btn btn--ghost btn--compact");
          mapsLink.href = mapsUrl;
          mapsLink.target = "_blank";
          mapsLink.rel = "noopener";
          mapsLink.title = t("card.mapsTitle");
          mapsLink.innerHTML = t("card.location");
          const copyMap = el("button", "btn btn--ghost btn--compact", t("card.link"));
          copyMap.type = "button";
          copyMap.title = t("card.linkTitle");
          copyMap.addEventListener("click", async () => {
            try {
              await copyText(mapsUrl);
              toast(t("toast.mapsCopied"));
            } catch {
              toast(t("toast.mapsCopyFail"));
            }
          });
          actions.append(mapsLink, copyMap);
        }
        const src = el("a", "btn btn--ghost btn--compact");
        src.href = it.source_url; src.target = "_blank"; src.rel = "noopener"; src.innerHTML = "↗";
        src.title = "Source";
        const rm = el("button", "btn btn--ghost btn--compact", "✕");
        rm.title = "Remove";
        rm.addEventListener("click", () => toggleAgenda(it));
        actions.append(src, rm);
        row.appendChild(actions);
        dayBlock.appendChild(row);
      });
      list.appendChild(dayBlock);
    });
  }

  /* ── parameters / API keys ───────────────────────────────────────────── */
  const OA_KEY_RE = /^oa_[A-Za-z0-9_]{8,180}$/;

  function isPlausibleOpenAgendaKey(key) {
    return typeof key === "string" && OA_KEY_RE.test(key.trim());
  }

  function sanitizeParams(params) {
    const next = { ...params };
    const key = next.openagenda_key?.trim();
    if (key && !isPlausibleOpenAgendaKey(key)) delete next.openagenda_key;
    return next;
  }

  function readParams() {
    try {
      const raw = localStorage.getItem(LS.params);
      const parsed = raw ? JSON.parse(raw) : {};
      const clean = sanitizeParams(parsed);
      if (JSON.stringify(clean) !== JSON.stringify(parsed)) {
        saveParams(clean);
      }
      return clean;
    } catch {
      localStorage.removeItem(LS.params);
      return {};
    }
  }

  function saveParams(values) {
    const cleaned = {};
    for (const [id, value] of Object.entries(values)) {
      const trimmed = typeof value === "string" ? value.trim() : "";
      if (!trimmed) continue;
      if (id === "openagenda_key" && !isPlausibleOpenAgendaKey(trimmed)) continue;
      cleaned[id] = trimmed;
    }
    if (Object.keys(cleaned).length) {
      localStorage.setItem(LS.params, JSON.stringify(cleaned));
    } else {
      localStorage.removeItem(LS.params);
    }
  }

  function serverHasOpenAgendaKey() {
    return state.serverOpenAgendaConfigured || state.keySpecs.some(
      (spec) => spec.id === "openagenda_key" && spec.server_configured
    );
  }

  function appendApiKeysToSearchParams(sp) {
    // When Docker/env provides a key, never let a stale browser override break discover.
    if (serverHasOpenAgendaKey()) return sp;
    const key = readParams().openagenda_key?.trim();
    if (key && isPlausibleOpenAgendaKey(key)) sp.set("openagenda_key", key);
    return sp;
  }

  function needsOpenAgendaRefresh() {
    if (!state.pins.length || !state.pins.every((p) => state.pinData[p.id])) return false;
    if (!serverHasOpenAgendaKey() && !state.connectionOk) return false;
    const eventCards = state.pins.flatMap((p) => state.pinData[p.id]?.events ?? [])
      .filter((e) => e.kind === "event");
    if (!eventCards.length) return false;
    return !eventCards.some((e) => (e.tags || []).includes("openagenda"));
  }

  function purgeBrowserKeyWhenServerConfigured() {
    if (!serverHasOpenAgendaKey()) return;
    if (readParams().openagenda_key) saveParams({});
  }

  function appendDiscoverParams(sp, { forDiscover = false, offset = 0, limit = DISCOVER_PAGE_SIZE } = {}) {
    appendApiKeysToSearchParams(sp);
    appendLangToSearchParams(sp);
    if (defaultCountry) sp.set("country", defaultCountry);
    if (forDiscover && state.filters.liveEventsOnly) {
      sp.set("live_events_only", "1");
    }
    if (forDiscover) {
      sp.set("offset", String(offset));
      sp.set("limit", String(limit));
    }
    return sp;
  }

  function discoverLoadedCount(pinId) {
    const data = state.pinData[pinId];
    if (!data) return 0;
    return (data.events?.length || 0) + (data.activities?.length || 0);
  }

  function discoverHasMore() {
    return state.pins.some((pin) => state.pinData[pin.id]?.pagination?.has_more);
  }

  function discoverUpstreamTotal() {
    return state.pins.reduce(
      (sum, pin) => sum + (state.pinData[pin.id]?.pagination?.total || 0),
      0
    );
  }

  function discoverLoadedTotal() {
    return state.pins.reduce((sum, pin) => sum + discoverLoadedCount(pin.id), 0);
  }

  function mergeDiscoverPage(pinId, page) {
    const cur = state.pinData[pinId];
    if (!cur) {
      state.pinData[pinId] = page;
      return;
    }
    const seen = new Set([
      ...(cur.events || []).map((item) => item.id),
      ...(cur.activities || []).map((item) => item.id),
    ]);
    for (const item of page.events || []) {
      if (!seen.has(item.id)) {
        cur.events.push(item);
        seen.add(item.id);
      }
    }
    for (const item of page.activities || []) {
      if (!seen.has(item.id)) {
        cur.activities.push(item);
        seen.add(item.id);
      }
    }
    if (page.pagination) cur.pagination = page.pagination;
    if (!cur.place && page.place) cur.place = page.place;
    if (!cur.weather?.days?.length && page.weather) cur.weather = page.weather;
  }

  function updateLoadMoreButton() {
    const wrap = $("#discover-more");
    const btn = $("#discover-load-more");
    if (!wrap || !btn) return;
    const show = state.tab === "discover" && state.pins.length && discoverHasMore();
    wrap.hidden = !show;
    btn.disabled = state.loadMoreInFlight || !show;
    btn.classList.toggle("is-loading", state.loadMoreInFlight);
  }

  let healthDebounceTimer = null;
  let healthRetryTimer = null;
  let healthInFlight = false;
  let lastHealthAt = 0;
  const HEALTH_DEBOUNCE_MS = 350;
  const HEALTH_MIN_INTERVAL_MS = 2000;

  function renderApiStatus(data) {
    const el = $("#api-status");
    if (!el) return;
    el.hidden = false;
    el.classList.remove("is-idle");
    if (data?.checking) {
      el.classList.add("is-checking");
      el.textContent = "…";
      el.title = t("status.checking");
      el.setAttribute("aria-label", el.title);
      return;
    }
    el.classList.remove("is-checking");

    let ok = false;
    let titleKey = "status.keyFail";
    if (data === null) {
      titleKey = "status.apiDown";
    } else if (data.connection_ok) {
      ok = true;
      titleKey = "status.ok";
    } else if (!data.openagenda?.configured) {
      titleKey = "status.keyFail";
    } else {
      titleKey = "status.keyFail";
    }

    el.textContent = ok ? "🟢" : "🔴";
    el.dataset.state = ok ? "ok" : "error";
    el.title = t(titleKey);
    el.setAttribute("aria-label", el.title);
  }

  async function checkApiHealth({ force = false, testKey } = {}) {
    await ensureApiBootstrap();
    const now = Date.now();
    if (!force && now - lastHealthAt < HEALTH_MIN_INTERVAL_MS) {
      clearTimeout(healthRetryTimer);
      healthRetryTimer = setTimeout(
        () => checkApiHealth({ force: true, testKey }),
        HEALTH_MIN_INTERVAL_MS - (now - lastHealthAt)
      );
      return null;
    }
    if (healthInFlight) return null;

    healthInFlight = true;
    renderApiStatus({ checking: true });
    try {
      const sp = new URLSearchParams();
      if (testKey !== undefined) {
        const trimmed = testKey?.trim();
        if (trimmed && isPlausibleOpenAgendaKey(trimmed)) {
          sp.set("openagenda_key", trimmed);
        }
      } else {
        appendApiKeysToSearchParams(sp);
      }
      const qs = sp.toString();
      const res = await fetch(`${API}/api/health${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("health failed");
      const data = await res.json();
      if (data.default_country) defaultCountry = data.default_country;
      state.serverOpenAgendaConfigured = Boolean(data.openagenda_enabled);
      state.connectionOk = Boolean(data.connection_ok);
      state.openagendaEnabled = state.connectionOk;
      purgeBrowserKeyWhenServerConfigured();

      if (
        !state.connectionOk
        && testKey === undefined
        && readParams().openagenda_key
        && serverHasOpenAgendaKey()
      ) {
        saveParams({});
        healthInFlight = false;
        return checkApiHealth({ force: true, testKey: null });
      }

      renderApiStatus(data);
      renderLiveEventsToggle();
      return data;
    } catch {
      if (testKey === undefined) {
        try {
          const raw = localStorage.getItem(LS.params);
          if (raw) {
            const key = JSON.parse(raw).openagenda_key?.trim();
            if (key && !isPlausibleOpenAgendaKey(key)) {
              saveParams({});
              healthInFlight = false;
              return checkApiHealth({ force: true, testKey: null });
            }
          }
        } catch {
          saveParams({});
          healthInFlight = false;
          return checkApiHealth({ force: true, testKey: null });
        }
      }
      state.connectionOk = false;
      state.openagendaEnabled = false;
      renderApiStatus(null);
      return null;
    } finally {
      lastHealthAt = Date.now();
      healthInFlight = false;
    }
  }

  function scheduleHealthCheck() {
    clearTimeout(healthDebounceTimer);
    healthDebounceTimer = setTimeout(() => checkApiHealth(), HEALTH_DEBOUNCE_MS);
  }

  function wireHealthChecks() {
    const handler = () => scheduleHealthCheck();
    document.querySelector("header.topbar")?.addEventListener("click", handler);
    document.querySelector("header.topbar")?.addEventListener("change", handler);
    document.querySelector("header.topbar")?.addEventListener("submit", handler);
    document.querySelector("main.layout")?.addEventListener("click", handler);
    document.querySelector("main.layout")?.addEventListener("change", handler);
    document.querySelector("main.layout")?.addEventListener("submit", handler);
  }

  function hasOpenAgendaKey() {
    if (state.connectionOk === true) return true;
    if (state.connectionOk === false) return false;
    const serverConfigured = state.keySpecs.some(
      (spec) => spec.id === "openagenda_key" && spec.server_configured
    );
    return serverConfigured || Boolean(readParams().openagenda_key?.trim());
  }

  function isHotTodayActive() {
    return state.filters.liveEventsOnly && state.filters.eventPeriod === "today";
  }

  function isHotWeekActive() {
    return state.filters.liveEventsOnly && state.filters.eventPeriod === "hot_week";
  }

  function deactivateHotFilterStorage() {
    localStorage.setItem(LS.hotToday, "0");
    localStorage.setItem(LS.hotWeek, "0");
  }

  function renderHotTodayButton() {
    const btn = $("#hot-today-btn");
    if (!btn) return;
    btn.classList.toggle("is-active", isHotTodayActive());
    btn.title = t("filter.hotTodayTitle");
    btn.setAttribute("aria-pressed", isHotTodayActive() ? "true" : "false");
  }

  function renderHotWeekButton() {
    const btn = $("#hot-week-btn");
    if (!btn) return;
    btn.classList.toggle("is-active", isHotWeekActive());
    btn.title = t("filter.hotWeekTitle");
    btn.setAttribute("aria-pressed", isHotWeekActive() ? "true" : "false");
  }

  function renderHotFilterButtons() {
    renderHotTodayButton();
    renderHotWeekButton();
  }

  function renderLiveEventsToggle() {
    const input = $("#live-events-only");
    const wrap = input?.closest(".switch--live");
    if (!input || !wrap) return;
    input.checked = state.filters.liveEventsOnly;
    const hasKey = hasOpenAgendaKey();
    input.disabled = false;
    wrap.classList.remove("is-disabled");
    wrap.title = hasKey ? t("filter.liveTitle") : t("filter.liveNoKey");
    renderHotFilterButtons();
  }

  function syncKindFilterUI() {
    $$("#kind-filter .seg").forEach((s) => {
      s.classList.toggle("is-active", s.dataset.kind === state.filters.kind);
    });
    renderTimeFilter();
  }

  async function setLiveEventsOnly(on, { reload = true } = {}) {
    state.filters.liveEventsOnly = Boolean(on);
    localStorage.setItem(LS.liveEventsOnly, on ? "1" : "0");
    if (!on && (state.filters.eventPeriod === "today" || state.filters.eventPeriod === "hot_week")) {
      state.filters.eventPeriod = "all";
      deactivateHotFilterStorage();
    }
    if (on && state.filters.kind === "all") {
      state.filters.kind = "event";
      syncKindFilterUI();
    }
    renderLiveEventsToggle();
    renderTimeFilter();
    if (on && !hasOpenAgendaKey()) toast(t("filter.liveNoKey"));
    else if (on) toast(t("toast.liveOn"));
    else toast(t("toast.liveOff"));
    if (reload && state.pins.length) await reloadSelection();
    else renderDiscover();
  }

  async function setHotToday(on, { reload = true } = {}) {
    if (on) {
      state.filters.eventPeriod = "today";
      state.filters.liveEventsOnly = true;
      if (state.filters.kind === "all" || state.filters.kind === "activity") {
        state.filters.kind = "event";
      }
      localStorage.setItem(LS.liveEventsOnly, "1");
      localStorage.setItem(LS.hotToday, "1");
      localStorage.setItem(LS.hotWeek, "0");
    } else {
      state.filters.eventPeriod = "all";
      state.filters.liveEventsOnly = false;
      localStorage.setItem(LS.liveEventsOnly, "0");
      deactivateHotFilterStorage();
    }
    renderHotFilterButtons();
    renderLiveEventsToggle();
    renderTimeFilter();
    syncKindFilterUI();
    if (on && !hasOpenAgendaKey()) toast(t("filter.liveNoKey"));
    else if (on) toast(t("toast.hotTodayOn"));
    else toast(t("toast.hotTodayOff"));
    if (reload && state.pins.length) {
      if (on) await reloadSelection();
      else renderDiscover();
    } else {
      renderDiscover();
    }
  }

  async function setHotWeek(on, { reload = true } = {}) {
    if (on) {
      state.filters.eventPeriod = "hot_week";
      state.filters.liveEventsOnly = true;
      if (state.filters.kind === "all" || state.filters.kind === "activity") {
        state.filters.kind = "event";
      }
      localStorage.setItem(LS.liveEventsOnly, "1");
      localStorage.setItem(LS.hotWeek, "1");
      localStorage.setItem(LS.hotToday, "0");
    } else {
      state.filters.eventPeriod = "all";
      state.filters.liveEventsOnly = false;
      localStorage.setItem(LS.liveEventsOnly, "0");
      deactivateHotFilterStorage();
    }
    renderHotFilterButtons();
    renderLiveEventsToggle();
    renderTimeFilter();
    syncKindFilterUI();
    if (on && !hasOpenAgendaKey()) toast(t("filter.liveNoKey"));
    else if (on) toast(t("toast.hotWeekOn"));
    else toast(t("toast.hotWeekOff"));
    if (reload && state.pins.length) {
      if (on) await reloadSelection();
      else renderDiscover();
    } else {
      renderDiscover();
    }
  }

  async function loadKeySpecs() {
    if (state.keySpecs.length) return;
    try {
      const res = await fetch(`${API}/api/keys`);
      if (!res.ok) return;
      const data = await res.json();
      state.keySpecs = data.keys || [];
    } catch { /* offline or API unavailable */ }
  }

  async function loadThemePalettes() {
    if (state.themePalettes.length) return;
    try {
      const res = await fetch(`${API}/api/theme`);
      if (!res.ok) return;
      const data = await res.json();
      state.themePalettes = data.palettes || [];
      state.serverPalette = data.active || null;
    } catch { /* offline or API unavailable */ }
  }

  function themeCssUrl(paletteId) {
    if (!paletteId) return `${API}/api/theme.css`;
    return `${API}/api/theme.css?palette=${encodeURIComponent(paletteId)}`;
  }

  function ensureThemeStylesheet() {
    let link = document.querySelector('link[data-theme-palette]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "stylesheet";
      link.dataset.themePalette = "1";
      document.head.appendChild(link);
    }
    return link;
  }

  function applyPalette(paletteId, { save = true } = {}) {
    if (!paletteId) return;
    ensureThemeStylesheet().href = themeCssUrl(paletteId);

    state.activePalette = paletteId;
    if (save) localStorage.setItem(LS.palette, paletteId);

    const pal = state.themePalettes.find((p) => p.id === paletteId);
    const accent = pal?.preview?.[0];
    if (accent) {
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = accent;
    }

    renderPaletteGrid();
  }

  function renderLanguagePicker() {
    const wrap = $("#language-options");
    if (!wrap) return;
    wrap.innerHTML = "";
    I18N.SUPPORTED.forEach((code) => {
      const btn = el("button", `language-option${getLang() === code ? " is-active" : ""}`);
      btn.type = "button";
      btn.dataset.lang = code;
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", getLang() === code ? "true" : "false");
      btn.textContent = t(`params.lang.${code}`);
      btn.addEventListener("click", () => {
        applyLanguage(code);
        toast(t("toast.lang", { label: t(`params.lang.${code}`) }));
      });
      wrap.appendChild(btn);
    });
  }

  function     applyLanguage(lang, { save = true, reload = true } = {}) {
    I18N.setLang(lang);
    if (save) localStorage.setItem(LS.lang, lang);
    renderLanguagePicker();
    I18N.applyStatic();
    renderTimeFilter();
    renderLiveEventsToggle();
    loadCategories().then(() => {
      renderChips();
      renderHero();
      renderPinnedChips();
      renderWarnings();
      renderActivePanel();
    });
    if (reload && state.pins.length) reloadSelection();
  }

  function renderPaletteGrid() {
    const grid = $("#palette-grid");
    if (!grid) return;

    if (!state.themePalettes.length) {
      grid.innerHTML = `<p class="params__note">${esc(t("params.theme.loadError"))}</p>`;
      return;
    }

    const active = state.activePalette || state.serverPalette;
    grid.innerHTML = "";

    state.themePalettes.forEach((pal) => {
      const colors = (pal.preview || []).filter(Boolean);
      const gradient = colors.length >= 2
        ? `linear-gradient(135deg, ${colors.join(", ")})`
        : (colors[0] || "var(--coral)");
      const btn = el("button", `palette-option${pal.id === active ? " is-active" : ""}`);
      btn.type = "button";
      btn.dataset.palette = pal.id;
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", pal.id === active ? "true" : "false");
      btn.setAttribute("aria-label", pal.label);
      btn.innerHTML = `
        <span class="palette-option__swatch" style="background:${gradient}"></span>
        <span class="palette-option__label">${esc(pal.label)}</span>`;
      btn.addEventListener("click", () => {
        applyPalette(pal.id);
        toast(t("toast.theme", { label: pal.label }));
      });
      grid.appendChild(btn);
    });
  }

  function renderParameters() {
    renderLanguagePicker();
    renderPaletteGrid();

    const container = $("#params-fields");
    const note = $("#params-note");
    if (!container) return;

    const saved = readParams();
    container.innerHTML = "";

    if (!state.keySpecs.length) {
      container.innerHTML = `<p class="params__note">${esc(t("params.keys.loadError"))}</p>`;
      if (note) note.textContent = t("params.note.keysOnly");
      return;
    }

    state.keySpecs.forEach((spec) => {
      const field = el("div", "param-field");
      const badge = spec.server_configured
        ? `<span class="param-field__badge">Server configured</span>`
        : "";
      field.innerHTML = `
        <div class="param-field__head">
          <label class="param-field__label" for="param-${esc(spec.id)}">${esc(spec.label)}</label>
          ${badge}
        </div>
        <p class="param-field__desc">
          ${esc(spec.description)}
          ${spec.signup_url ? ` <a href="${esc(spec.signup_url)}" target="_blank" rel="noopener">Get a free key ↗</a>` : ""}
        </p>
        <input
          class="param-field__input"
          id="param-${esc(spec.id)}"
          name="${esc(spec.id)}"
          type="password"
          autocomplete="new-password"
          autocapitalize="off"
          spellcheck="false"
          data-lpignore="true"
          data-1p-ignore="true"
          placeholder="${spec.server_configured ? "Leave empty to use server key" : "Paste your API key"}"
          value="${esc(saved[spec.id] || "")}"
        />
        <p class="param-field__meta">Env var: <code>${esc(spec.env_var || spec.id)}</code></p>`;
      container.appendChild(field);
    });

    if (note) note.textContent = t("params.note");
  }

  function collectParamsFromForm() {
    const values = {};
    state.keySpecs.forEach((spec) => {
      const input = document.getElementById(`param-${spec.id}`);
      const trimmed = input?.value.trim();
      if (trimmed) values[spec.id] = trimmed;
    });
    return values;
  }

  async function clearCachedResults() {
    if (!window.confirm(t("params.cache.confirm"))) return;

    let serverOk = true;
    try {
      const res = await fetch(`${API}/api/cache/clear`, { method: "POST" });
      serverOk = res.ok;
    } catch {
      serverOk = false;
    }

    state.pinData = {};
    localStorage.removeItem(LS.dismissedNotices);

    toast(serverOk ? t("toast.cacheCleared") : t("toast.cacheClearFail"));

    if (state.pins.length) {
      await reloadSelection();
      setTab("discover");
    } else {
      renderWarnings();
      renderActivePanel();
    }
  }

  function resetAgendaAndFavorites() {
    if (!window.confirm(t("params.reset.confirm"))) return;

    localStorage.removeItem(LS.favorites);
    localStorage.removeItem(LS.agenda);
    refreshCounts();
    updateAgendaExportBar();
    renderActivePanel();
    toast(t("toast.resetDone"));
  }

  function renderActivePanel() {
    if (state.tab === "discover") renderDiscover();
    else if (state.tab === "warnings") renderWarnings();
    else if (state.tab === "favorites") renderFavorites();
    else if (state.tab === "agenda") renderAgenda();
    else if (state.tab === "parameters") renderParameters();
  }

  /* ── chips ───────────────────────────────────────────────────────────── */
  function renderChips() {
    const wrap = $("#category-chips");
    wrap.innerHTML = "";
    const all = el("button", `chip ${state.filters.category === "all" ? "is-active" : ""}`, t("filter.all"));
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

  const TIME_PERIOD_LABELS = {
    all: "filter.time.all",
    today: "filter.time.today",
    hot_week: "filter.time.hotWeek",
    week: "filter.time.week",
    month: "filter.time.month",
    quarter: "filter.time.quarter",
  };

  function renderTimeFilter() {
    const label = $("#time-filter-label");
    const btn = $("#time-filter-btn");
    const period = state.filters.eventPeriod;
    if (label) {
      label.textContent = t(TIME_PERIOD_LABELS[period] || TIME_PERIOD_LABELS.all);
    }
    if (btn) {
      const disabled = state.filters.kind === "activity";
      btn.disabled = disabled;
      btn.classList.toggle("is-disabled", disabled);
      btn.setAttribute("aria-disabled", disabled ? "true" : "false");
    }
    $$("#time-filter-menu .time-filter__option").forEach((opt) => {
      opt.classList.toggle("is-active", opt.dataset.period === period);
      opt.setAttribute("aria-selected", opt.dataset.period === period ? "true" : "false");
    });
  }

  function setEventPeriod(period) {
    if (!TIME_PERIOD_LABELS[period]) return;
    state.filters.eventPeriod = period;
    if (period !== "today" && period !== "hot_week") {
      deactivateHotFilterStorage();
    }
    closeTimeFilterMenu();
    renderTimeFilter();
    renderHotFilterButtons();
    renderDiscover();
  }

  function closeTimeFilterMenu() {
    const menu = $("#time-filter-menu");
    const btn = $("#time-filter-btn");
    if (!menu || !btn) return;
    menu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  }

  function toggleTimeFilterMenu() {
    if (state.filters.kind === "activity") return;
    const menu = $("#time-filter-menu");
    const btn = $("#time-filter-btn");
    if (!menu || !btn) return;
    const open = menu.hidden;
    menu.hidden = !open;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  /* ── pinned chips ────────────────────────────────────────────────────── */
  function groupPinsForDisplay(pins) {
    const groups = [];
    const byCity = new Map();

    for (const pin of pins) {
      const key = pin.postcode ? `city:${pin.name}` : `place:${pin.id}`;
      if (!byCity.has(key)) {
        const group = { city: pin.postcode ? pin.name : pinLabel(pin), pins: [] };
        byCity.set(key, group);
        groups.push(group);
      }
      byCity.get(key).pins.push(pin);
    }
    return groups;
  }

  function renderPinnedChips() {
    const bar       = $("#pinned-bar");
    const container = $("#pinned-chips");
    if (!state.pins.length) {
      bar.hidden = true;
      updateRefreshButton();
      return;
    }
    bar.hidden        = false;
    container.innerHTML = "";

    groupPinsForDisplay(state.pins).forEach((group) => {
      const collapse = group.pins.length > 1 && group.pins.every((p) => p.postcode);
      const loaded = group.pins.every((p) => state.pinData[p.id]);
      const city = group.city;

      if (collapse) {
        const removeLabel = t("pin.removeGroup", { city, count: group.pins.length });
        const chip = el("div", `pin-chip pin-chip--group${!loaded ? " is-loading" : ""}`, "");
        chip.innerHTML = `
          <span class="pin-chip__dot${!loaded ? " is-loading" : ""}"></span>
          <span class="pin-chip__name">${esc(city)}</span>
          <button class="pin-chip__remove" type="button" title="Remove ${esc(removeLabel)}" aria-label="Remove ${esc(removeLabel)}">×</button>`;
        chip.querySelector(".pin-chip__remove").addEventListener("click", () => {
          removePins(group.pins.map((p) => p.id));
        });
        container.appendChild(chip);
        return;
      }

      group.pins.forEach((pin) => {
        const pinLoaded = Boolean(state.pinData[pin.id]);
        const code = pin.postcode || "";
        const removeLabel = code ? t("pin.remove", { label: `${city} (${code})` }) : t("pin.remove", { label: city });
        const chip = el("div", `pin-chip${!pinLoaded ? " is-loading" : ""}`, "");
        chip.innerHTML = `
          <span class="pin-chip__dot${!pinLoaded ? " is-loading" : ""}"></span>
          <span class="pin-chip__name">${esc(city)}</span>
          ${code ? `<span class="pin-chip__code">${esc(code)}</span>` : ""}
          <button class="pin-chip__remove" type="button" title="Remove ${esc(removeLabel)}" aria-label="Remove ${esc(removeLabel)}">×</button>`;
        chip.querySelector(".pin-chip__remove").addEventListener("click", () => removePin(pin.id));
        container.appendChild(chip);
      });
    });
    updateRefreshButton();
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

  function clearPinSelection() {
    state.pins = [];
    state.pinData = {};
  }

  function addPin(suggestion) {
    const pin = suggestionToPin(suggestion);
    if (state.pins.some((p) => p.id === pin.id)) {
      toast(t("toast.alreadyPinned", { label: pinLabel(pin) }));
      closeDropdown();
      return;
    }
    state.pins.push(pin);
    closeDropdown();
    $("#city-input").value = "";
    setTab("discover");
    reloadSelection();
  }

  async function resolvePostcodeSuggestion(code, parent) {
    await ensureApiBootstrap();
    const clean = String(code).trim();
    if (!clean) return null;
      const res = await fetch(`${API}/api/geocode?${appendDiscoverParams(new URLSearchParams({ q: clean }))}`);
    if (!res.ok) throw new Error("Lookup failed");
    const data = await res.json();
    const suggestions = data.suggestions || [];
    const match = suggestions.find((s) => s.kind === "postcode" || s.postcode === clean) || suggestions[0];
    if (!match) return null;
    const pin = suggestionToPin(match);
    if (parent?.name && pin.postcode) {
      pin.display = `${pin.postcode} · ${parent.name}`;
    }
    return pin;
  }

  async function addPinFromPostcode(code, parent, { reload = true } = {}) {
    const clean = String(code).trim();
    if (!clean) return false;
    if (isPostcodePinned(clean)) {
      toast(t("toast.alreadyPinned", { label: clean }));
      return false;
    }
    try {
      const pin = await resolvePostcodeSuggestion(clean, parent);
      if (!pin) {
        toast(t("toast.postcodeNotFound", { code: clean }));
        return false;
      }
      state.pins.push(pin);
      if (reload) {
        setTab("discover");
        await reloadSelection();
        toast(t("toast.pinned", { code: clean }));
        const query = $("#city-input").value.trim();
        if (query.length >= 2) fetchSuggestions(query);
      }
      return true;
    } catch {
      toast(t("toast.postcodePinFail", { code: clean }));
      return false;
    }
  }

  async function addAllPostcodesFromArea(area, { replace = false } = {}) {
    if (replace) clearPinSelection();

    const codes = (area.postcodes || []).filter((code) => !isPostcodePinned(code));
    if (!codes.length) {
      toast(t("toast.areaFullyPinned", { city: area.name }));
      closeDropdown();
      return;
    }

    closeDropdown();
    $("#city-input").value = "";
    setTab("discover");
    showLoading(true, t("loading.pinCity", { city: area.name }));

    try {
      const resolved = await Promise.all(
        codes.map(async (code) => {
          try {
            return await resolvePostcodeSuggestion(code, area);
          } catch {
            return null;
          }
        })
      );

      let added = 0;
      for (const pin of resolved) {
        if (!pin || state.pins.some((p) => p.id === pin.id)) continue;
        state.pins.push(pin);
        added += 1;
      }

      if (!added) {
        toast(t("toast.areaPinFail", { city: area.name }));
        return;
      }

      await reloadSelection();
      toast(added === 1
        ? t("toast.areaPinned", { count: added, city: area.name })
        : t("toast.areaPinnedPlural", { count: added, city: area.name }));
    } finally {
      showLoading(false);
    }
  }

  function removePin(id) {
    removePins([id]);
  }

  function removePins(ids) {
    const idSet = new Set(ids);
    if (!idSet.size) return;
    state.pins = state.pins.filter((p) => !idSet.has(p.id));
    ids.forEach((id) => delete state.pinData[id]);
    reloadSelection();
  }

  /* ── autocomplete ────────────────────────────────────────────────────── */
  async function fetchSuggestions(query) {
    await ensureApiBootstrap();
    if (acController) acController.abort();
    acController = new AbortController();
    try {
      const sp = appendDiscoverParams(new URLSearchParams({ q: query, count: "8" }));
      const res  = await fetch(
        `${API}/api/geocode?${sp}`,
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
    acSuggestions = suggestions;
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
        const fullyPinned = isAreaFullyPinned(s);
        const codeBtns = codes.map((code) => {
          const pinned = isPostcodePinned(code);
          return `<button type="button" class="ac-item__code-btn${pinned ? " is-pinned" : ""}" data-code="${esc(code)}" ${pinned ? "disabled" : ""}>${pinned ? "✓ " : "+ "}${esc(code)}</button>`;
        }).join("");

        li.innerHTML = `
          <div class="ac-item__head">
            <div class="ac-item__info">
              <div class="ac-item__name">${esc(s.name)}</div>
              <div class="ac-item__meta">${esc([s.admin1, s.country].filter(Boolean).join(", "))}</div>
            </div>
            <button type="button" class="ac-item__pin-all" ${fullyPinned ? "disabled" : ""}>
              ${fullyPinned ? esc(t("ac.allPinned")) : esc(t("ac.pinAll", { count: codes.length }))}
            </button>
          </div>
          <div class="ac-item__hint">${esc(t("ac.hint"))}</div>
          <div class="ac-item__codes">${codeBtns}</div>`;

        const pinAll = li.querySelector(".ac-item__pin-all:not(:disabled)");
        if (pinAll) {
          pinAll.addEventListener("click", (e) => {
            e.stopPropagation();
            addAllPostcodesFromArea(s);
          });
        }

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
          <button class="ac-item__pin" type="button" ${isPinned ? "disabled" : ""}>${isPinned ? esc(t("ac.pinned")) : esc(t("ac.pin"))}</button>`;

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
    acSuggestions = [];
    acFocused = -1;
    const input = $("#city-input");
    if (input) {
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
    }
  }

  function moveFocus(dir) {
    const items = $$(
      "#autocomplete-list .ac-item:not(.is-pinned) .ac-item__pin:not(:disabled), " +
      "#autocomplete-list .ac-item__pin-all:not(:disabled), " +
      "#autocomplete-list .ac-item__code-btn:not(:disabled)"
    );
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
      const res  = await fetch(`${API}/api/categories?lang=${encodeURIComponent(getLang())}`);
      const data = await res.json();
      state.categories = data.categories || [];
    } catch { state.categories = []; }
    renderChips();
  }

  function updateRefreshButton() {
    const btn = $("#discover-refresh");
    if (!btn) return;
    btn.disabled = !state.pins.length || state.refreshInFlight;
    btn.classList.toggle("is-spinning", state.refreshInFlight);
  }

  async function fetchDiscoverForPin(pin, { refresh = false, offset = 0 } = {}) {
    const placeName = pin.postcode ? `${pin.postcode} · ${pin.name}` : pin.name;
    const params = {
      lat: String(pin.latitude),
      lon: String(pin.longitude),
      place_name: placeName,
    };
    if (pin.name && pin.name !== pin.postcode) {
      params.city_name = pin.name;
    }
    const sp = appendDiscoverParams(new URLSearchParams(params), {
      forDiscover: true,
      offset,
    });
    if (refresh) sp.set("refresh", "1");
    const res = await fetch(`${API}/api/discover?${sp}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Could not load this location.");
    }
    return res.json();
  }

  /** Re-fetch discover data for every pinned location and rebuild the UI. */
  async function reloadSelection({ refresh = false, oaRetry = false } = {}) {
    await ensureApiBootstrap();
    const gen = ++loadGeneration;
    prunePinData();
    savePins();
    renderPinnedChips();
    updateRefreshButton();

    if (!state.pins.length) {
      clearResults();
      return;
    }

    renderHero();

    // Drop cached results immediately so cards from a previous selection never linger.
    state.pinData = {};
    renderWeather();
    renderWarnings();
    renderActivePanel();

    const loadingMsg = refresh ? t("loading.refresh") : t("loading.updating");
    const loadingTimer = setTimeout(() => showLoading(true, loadingMsg), 220);
    if (refresh) {
      state.refreshInFlight = true;
      updateRefreshButton();
    }

    try {
      const results = await Promise.all(
        state.pins.map(async (pin) => {
          try {
            const data = await fetchDiscoverForPin(pin, { refresh });
            return { pin, data, error: null };
          } catch (error) {
            return { pin, data: null, error };
          }
        })
      );

      if (gen !== loadGeneration) return;

      // Rebuild pinData from scratch so removed pins never leave stale cards.
      const nextData = {};
      const failed = [];

      for (const { pin, data, error } of results) {
        if (!state.pins.some((p) => p.id === pin.id)) continue;
        if (error || !data) {
          failed.push(pin);
          continue;
        }
        nextData[pin.id] = data;
      }

      state.pinData = nextData;

      if (failed.length) {
        failed.forEach((pin) => {
          const idx = state.pins.findIndex((p) => p.id === pin.id);
          if (idx !== -1) state.pins.splice(idx, 1);
          toast(t("toast.loadPinFail", { label: pinLabel(pin) }));
        });
        prunePinData();
        savePins();
      }

      if (gen !== loadGeneration) return;

      if (!state.pins.length) {
        clearResults();
        return;
      }

      renderPinnedChips();
      renderHero();
      renderWeather();
      renderWarnings();
      renderActivePanel();
      if (refresh && gen === loadGeneration && Object.keys(state.pinData).length) {
        toast(t("toast.refreshDone"));
        checkApiHealth({ force: true });
      }

      if (rawDiscoverCounts().live > 0) {
        state.oaRenderRetry = false;
      }

      if (!oaRetry && !refresh && gen === loadGeneration && needsOpenAgendaRefresh()) {
        await reloadSelection({ refresh: true, oaRetry: true });
      }
    } finally {
      if (gen === loadGeneration) {
        clearTimeout(loadingTimer);
        showLoading(false);
      }
      if (refresh) {
        state.refreshInFlight = false;
        updateRefreshButton();
      }
    }
  }

  async function refreshOpenAgenda() {
    if (!state.pins.length) {
      toast(t("toast.refreshNoPins"));
      return;
    }
    await reloadSelection({ refresh: true });
  }

  async function loadMoreDiscover() {
    if (!discoverHasMore() || state.loadMoreInFlight) return;
    await ensureApiBootstrap();
    state.loadMoreInFlight = true;
    updateLoadMoreButton();
    const loadingTimer = setTimeout(() => showLoading(true, t("loading.more")), 220);
    try {
      const pinsToLoad = state.pins.filter((pin) => state.pinData[pin.id]?.pagination?.has_more);
      const results = await Promise.all(
        pinsToLoad.map(async (pin) => {
          const pag = state.pinData[pin.id].pagination;
          const nextOffset = (pag?.offset || 0) + (pag?.returned || 0);
          try {
            const data = await fetchDiscoverForPin(pin, { offset: nextOffset });
            return { pin, data, error: null };
          } catch (error) {
            return { pin, data: null, error };
          }
        })
      );
      for (const { pin, data, error } of results) {
        if (error || !data) {
          toast(error?.message || t("toast.error"));
          continue;
        }
        mergeDiscoverPage(pin.id, data);
      }
      renderWeather();
      renderWarnings();
      renderActivePanel();
    } finally {
      clearTimeout(loadingTimer);
      showLoading(false);
      state.loadMoreInFlight = false;
      updateLoadMoreButton();
    }
  }

  /** Load by city name string (legacy path & form fallback — geocodes on the server). */
  async function loadCityName(city, { refresh = false } = {}) {
    await ensureApiBootstrap();
    const loadingTimer = setTimeout(
      () => showLoading(true, t("loading.city", { city })), 220
    );
    try {
      const sp = appendDiscoverParams(new URLSearchParams({ city }), { forDiscover: true });
      if (refresh) sp.set("refresh", "1");
      const res = await fetch(`${API}/api/discover?${sp}`);
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

      clearPinSelection();
      state.pins = [pin];
      state.pinData = { [pin.id]: data };
      savePins();
      renderPinnedChips();
      renderHero();
      renderWeather();
      renderWarnings();
      renderActivePanel();
    } catch (e) {
      toast(e.message || t("toast.error"));
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
    if (tab === "parameters") {
      ensureApiBootstrap().then(() => renderActivePanel());
      return;
    }
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

      const listOpen = !$("#autocomplete-list").hidden;

      // Keyboard-focused postcode chip or pin button
      const focusedBtn = $(
        "#autocomplete-list .ac-item.is-focused .ac-item__pin-all:not(:disabled), " +
        "#autocomplete-list .ac-item.is-focused .ac-item__code-btn:not(:disabled), " +
        "#autocomplete-list .ac-item.is-focused .ac-item__pin:not(:disabled)"
      );
      if (focusedBtn) { focusedBtn.click(); return; }

      // Direct postal-code entry replaces the current selection
      if (looksLikePostcode(query)) {
        setTab("discover");
        closeDropdown();
        if (isPostcodePinned(query)) {
          toast(t("toast.alreadyPinned", { label: query }));
          return;
        }
        clearPinSelection();
        await addPinFromPostcode(query);
        return;
      }

      // Enter without an explicit pin action → replace the current selection.
      const areaSuggestion = acSuggestions.find(
        (s) => s.kind === "area" && (s.postcodes || []).length > 1
      );
      if (areaSuggestion && listOpen) {
        await addAllPostcodesFromArea(areaSuggestion, { replace: true });
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

    // Keyboard navigation in dropdown; Backspace on empty input removes last pin
    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !input.value && state.pins.length) {
        e.preventDefault();
        const last = state.pins[state.pins.length - 1];
        removePin(last.id);
        toast(t("toast.pinRemoved", { label: pinLabel(last) }));
        return;
      }

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
        if (b.dataset.kind !== "event" && (isHotTodayActive() || isHotWeekActive())) {
          state.filters.eventPeriod = "all";
          state.filters.liveEventsOnly = false;
          localStorage.setItem(LS.liveEventsOnly, "0");
          deactivateHotFilterStorage();
          renderHotFilterButtons();
          renderLiveEventsToggle();
        }
        syncKindFilterUI();
        renderDiscover();
      })
    );

    $("#time-filter-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleTimeFilterMenu();
    });

    $$("#time-filter-menu .time-filter__option").forEach((opt) => {
      opt.addEventListener("click", () => setEventPeriod(opt.dataset.period));
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest("#time-filter")) closeTimeFilterMenu();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeTimeFilterMenu();
    });

    $("#discover-refresh")?.addEventListener("click", () => refreshOpenAgenda());
    $("#discover-load-more")?.addEventListener("click", () => loadMoreDiscover());
    $("#hot-today-btn")?.addEventListener("click", () => setHotToday(!isHotTodayActive()));
    $("#hot-week-btn")?.addEventListener("click", () => setHotWeek(!isHotWeekActive()));

    $("#live-events-only")?.addEventListener("change", (e) => {
      setLiveEventsOnly(e.target.checked);
    });

    $("#outdoor-only").addEventListener("change", (e) => {
      state.filters.outdoorOnly = e.target.checked;
      renderDiscover();
    });

    $("#theme-toggle").addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme");
      applyTheme(current === "dark" ? "light" : "dark");
    });

    $("#agenda-copy-text").addEventListener("click", async () => {
      if (!Object.keys(agenda()).length) return;
      try {
        await copyText(buildAgendaPlainText());
        toast(t("toast.agendaCopied"));
      } catch {
        toast(t("toast.agendaCopyFail"));
      }
    });

    $("#agenda-download-ics").addEventListener("click", () => {
      if (!Object.keys(agenda()).length) return;
      const stamp = new Date().toISOString().slice(0, 10);
      downloadFile(`citychilly-agenda-${stamp}.ics`, buildAgendaICS(), "text/calendar;charset=utf-8");
      toast(t("toast.icsDownloaded"));
    });

    $("#agenda-download-json").addEventListener("click", () => {
      if (!Object.keys(agenda()).length) return;
      const stamp = new Date().toISOString().slice(0, 10);
      downloadFile(`citychilly-agenda-${stamp}.json`, buildAgendaJSON(), "application/json;charset=utf-8");
      toast(t("toast.jsonDownloaded"));
    });

    $("#params-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const rawKey = document.getElementById("param-openagenda_key")?.value.trim();
      if (rawKey && !isPlausibleOpenAgendaKey(rawKey)) {
        toast(t("toast.keyMalformed"));
        return;
      }
      const values = collectParamsFromForm();
      const testKey = values.openagenda_key ?? null;
      const data = await checkApiHealth({ force: true, testKey });
      if (testKey && !data?.connection_ok) {
        toast(t("toast.keyInvalid"));
        return;
      }
      saveParams(values);
      toast(
        testKey
          ? t("toast.keyValid")
          : data?.connection_ok
            ? t("toast.paramsSaved")
            : t("toast.keyMissing")
      );
      renderLiveEventsToggle();
      if (state.pins.length) {
        await reloadSelection();
        setTab("discover");
      }
    });

    $("#params-clear").addEventListener("click", async () => {
      saveParams({});
      state.keySpecs.forEach((spec) => {
        const input = document.getElementById(`param-${spec.id}`);
        if (input) input.value = "";
      });
      const data = await checkApiHealth({ force: true, testKey: null });
      renderLiveEventsToggle();
      toast(
        data?.connection_ok
          ? t("toast.keysClearedServer")
          : t("toast.keysCleared")
      );
      if (state.pins.length) await reloadSelection();
    });

    $("#params-clear-cache").addEventListener("click", () => {
      clearCachedResults();
    });

    $("#params-reset-data").addEventListener("click", () => {
      resetAgendaAndFavorites();
    });

    wireHealthChecks();
  }

  /* ── init ────────────────────────────────────────────────────────────── */
  function readString(key) {
    let v = localStorage.getItem(key);
    try { v = JSON.parse(v); } catch { /* legacy plain string */ }
    return typeof v === "string" ? v : null;
  }

  function init() {
    readParams();

    const savedPalette = readString(LS.palette);
    if (savedPalette) state.activePalette = savedPalette;

    const savedLang = readString(LS.lang);
    I18N.setLang(savedLang || "fr");
    I18N.applyStatic();

    let theme = readString(LS.theme);
    if (theme !== "light" && theme !== "dark") {
      theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    applyTheme(theme);

    wire();
    const hotToday = localStorage.getItem(LS.hotToday) === "1";
    const hotWeek = localStorage.getItem(LS.hotWeek) === "1";
    state.filters.liveEventsOnly = hotToday || hotWeek || localStorage.getItem(LS.liveEventsOnly) === "1";
    if (hotToday) {
      state.filters.eventPeriod = "today";
      state.filters.kind = "event";
    } else if (hotWeek) {
      state.filters.eventPeriod = "hot_week";
      state.filters.kind = "event";
    } else if (state.filters.liveEventsOnly && state.filters.kind === "all") {
      state.filters.kind = "event";
    }
    syncKindFilterUI();
    renderTimeFilter();
    renderLiveEventsToggle();
    renderHotFilterButtons();
    refreshCounts();
    updateAgendaExportBar();
    renderChips();

    state.pins = [];
    state.pinData = {};
    $("#city-input").value = "";
    clearResults();
    renderActivePanel();
    updateRefreshButton();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
