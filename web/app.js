/* =========================================================================
   CityChilly front-end logic (vanilla JS, no build step)
   ========================================================================= */
(() => {
  "use strict";

  const I18N = window.CityChillyI18n || {
    t: (key) => key,
    getLang: () => "en",
    setLang: () => "en",
    applyStatic: () => {},
    translateKeyword: (word) => word,
    dateLocale: () => undefined,
    SUPPORTED: ["en", "fr"],
  };
  const t = (key, vars) => I18N.t(key, vars);
  const getLang = () => I18N.getLang();
  const translateKeyword = (word) => I18N.translateKeyword(word);
  const dateLocale = () => I18N.dateLocale();

  const API = "";
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
    keySpecs: [],
    themePalettes: [],
    activePalette: null,
    serverPalette: null,
  };

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

  const fmtDay = (iso) => {
    if (!iso) return null;
    return new Date(iso + "T00:00:00").toLocaleDateString(dateLocale(), {
      weekday: "short", month: "short", day: "numeric",
    });
  };
  const fmtRange = (start, end) => {
    if (!start) return t("card.anytime");
    if (!end || end === start) return fmtDay(start);
    return `${fmtDay(start)} – ${fmtDay(end)}`;
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
        : new Date(d.date + "T00:00:00").toLocaleDateString(dateLocale(), { weekday: "short" });
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

  /* ── card ────────────────────────────────────────────────────────────── */
  function card(item) {
    const meta = catMeta(item.category);
    const node = el("article", "card");
    node.dataset.id = item.id;

    const media = el("div", `card__media cat-${esc(item.category)}`);
    const keyword = itemKeyword(item);
    media.innerHTML = `
      <div class="card__topbar">
        <div class="card__header">
          <span class="card__emoji" aria-hidden="true">${meta.emoji}</span>
          <p class="card__keyword">${esc(keyword)}</p>
        </div>
        <button class="card__fav ${isFav(item.id) ? "is-active" : ""}" title="${esc(t("card.fav"))}" aria-label="${esc(t("card.fav"))}">
          ${isFav(item.id) ? "❤️" : "🤍"}
        </button>
      </div>
      <span class="card__kind">${item.kind === "event" ? t("card.event") : t("card.activity")}</span>`;
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
    if (eyebrow) eyebrow.textContent = t("hero.exploring");
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
    const codes = state.pins.map((p) => p.postcode).filter(Boolean);
    const locText = codes.length
      ? codes.join(", ")
      : loaded.length > 1
        ? `${loaded.length} locations`
        : (loaded[0] ? (state.pinData[loaded[0].id]?.place?.name || loaded[0].name) : t("results.yourCity"));

    meta.textContent = items.length === 1
      ? t("results.count", { count: items.length, place: locText })
      : t("results.countPlural", { count: items.length, place: locText });

    if (!items.length) {
      empty.hidden = false;
      empty.innerHTML = `<div class="empty__emoji">🧐</div><h3>${esc(t("empty.noFilter.title"))}</h3><p>${esc(t("empty.noFilter.body"))}</p>`;
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
      `Exported ${new Date().toLocaleString()}`,
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
  function readParams() {
    try {
      const raw = localStorage.getItem(LS.params);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  function saveParams(values) {
    localStorage.setItem(LS.params, JSON.stringify(values));
  }

  function appendApiKeysToSearchParams(sp) {
    const params = readParams();
    if (params.openagenda_key?.trim()) {
      sp.set("openagenda_key", params.openagenda_key.trim());
    }
    return sp;
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

  function applyPalette(paletteId, { save = true } = {}) {
    if (!paletteId) return;
    const link = document.querySelector('link[href*="/api/theme.css"]');
    if (link) link.href = themeCssUrl(paletteId);

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

  function applyLanguage(lang, { save = true, reload = true } = {}) {
    I18N.setLang(lang);
    if (save) localStorage.setItem(LS.lang, lang);
    renderLanguagePicker();
    I18N.applyStatic();
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
          autocomplete="off"
          spellcheck="false"
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
      if (input) values[spec.id] = input.value.trim();
    });
    return values;
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
    if (!state.pins.length) { bar.hidden = true; return; }
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
    const clean = String(code).trim();
    if (!clean) return null;
      const res = await fetch(`${API}/api/geocode?${appendLangToSearchParams(new URLSearchParams({ q: clean }))}`);
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

  async function addAllPostcodesFromArea(area) {
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
    if (acController) acController.abort();
    acController = new AbortController();
    try {
      const sp = appendLangToSearchParams(new URLSearchParams({ q: query, count: "8" }));
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

  async function fetchDiscoverForPin(pin) {
    const placeName = pin.postcode ? `${pin.postcode} · ${pin.name}` : pin.name;
    const params = {
      lat: String(pin.latitude),
      lon: String(pin.longitude),
      place_name: placeName,
    };
    if (pin.name && pin.name !== pin.postcode) {
      params.city_name = pin.name;
    }
    const sp = appendLangToSearchParams(appendApiKeysToSearchParams(new URLSearchParams(params)));
    const res = await fetch(`${API}/api/discover?${sp}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Could not load this location.");
    }
    return res.json();
  }

  /** Re-fetch discover data for every pinned location and rebuild the UI. */
  async function reloadSelection() {
    const gen = ++loadGeneration;
    prunePinData();
    savePins();
    renderPinnedChips();

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

    const loadingTimer = setTimeout(() => showLoading(true, t("loading.updating")), 220);

    try {
      const results = await Promise.all(
        state.pins.map(async (pin) => {
          try {
            const data = await fetchDiscoverForPin(pin);
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
    } finally {
      if (gen === loadGeneration) {
        clearTimeout(loadingTimer);
        showLoading(false);
      }
    }
  }

  /** Load by city name string (legacy path & form fallback — geocodes on the server). */
  async function loadCityName(city) {
    const loadingTimer = setTimeout(
      () => showLoading(true, t("loading.city", { city })), 220
    );
    try {
      const sp = appendLangToSearchParams(appendApiKeysToSearchParams(new URLSearchParams({ city })));
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
        state.pins = [];
        state.pinData = {};
        await addPinFromPostcode(query);
        return;
      }

      // City with agglomeration — pin all postal codes by default
      const areaSuggestion = acSuggestions.find(
        (s) => s.kind === "area" && (s.postcodes || []).length > 1
      );
      if (areaSuggestion && listOpen) {
        await addAllPostcodesFromArea(areaSuggestion);
        return;
      }

      // Fall back to the first pinable suggestion if dropdown is visible
      const firstPin = $("#autocomplete-list .ac-item:not(.ac-item--area):not(.is-pinned) .ac-item__pin:not(:disabled)");
      if (firstPin && listOpen) { firstPin.click(); return; }

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
      saveParams(collectParamsFromForm());
      toast(t("toast.paramsSaved"));
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
      toast(t("toast.keysCleared"));
      if (state.pins.length) await reloadSelection();
    });
  }

  /* ── init ────────────────────────────────────────────────────────────── */
  function readString(key) {
    let v = localStorage.getItem(key);
    try { v = JSON.parse(v); } catch { /* legacy plain string */ }
    return typeof v === "string" ? v : null;
  }

  function init() {
    const savedPalette = readString(LS.palette);
    if (savedPalette) {
      const link = document.querySelector('link[href*="/api/theme.css"]');
      if (link) link.href = themeCssUrl(savedPalette);
      state.activePalette = savedPalette;
    }

    const savedLang = readString(LS.lang);
    const browserLang = navigator.language?.toLowerCase().startsWith("fr") ? "fr" : "en";
    I18N.setLang(savedLang || browserLang);
    I18N.applyStatic();

    let theme = readString(LS.theme);
    if (theme !== "light" && theme !== "dark") {
      theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    applyTheme(theme);

    wire();
    refreshCounts();
    updateAgendaExportBar();
    loadCategories();
    Promise.all([loadThemePalettes(), loadKeySpecs()]).then(() => {
      const savedPal = readString(LS.palette);
      if (savedPal && state.themePalettes.some((p) => p.id === savedPal)) {
        applyPalette(savedPal, { save: false });
      } else if (state.serverPalette) {
        state.activePalette = state.serverPalette;
      }
      renderLanguagePicker();
      renderParameters();
    });

    // Restore pinned locations (new format) or fall back to legacy lastCity
    const savedPins = readPins();
    if (savedPins) {
      state.pins = savedPins;
      state.pinData = {};
      reloadSelection();
    } else {
      const lastCity = readString(LS.city) || "Nantes";
      $("#city-input").value = lastCity;
      loadCityName(lastCity);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
