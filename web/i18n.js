/* CityChilly UI translations (en / fr) */
(() => {
  "use strict";

  const MESSAGES = {
    en: {
      "meta.title": "CityChilly · Discover your city",
      "meta.description": "CityChilly - discover activities and outdoor events for any city, manage your agenda and save favorites.",
      "brand.aria": "CityChilly home",
      "search.aria": "Location search",
      "search.placeholder": "City or postal code…",
      "search.submit": "Explore",
      "search.suggestions": "Location suggestions",
      "theme.toggle": "Toggle light / dark",
      "pinned.label": "Postal codes in scope",
      "pinned.aria": "Pinned postal codes",
      "hero.exploring": "Now exploring",
      "hero.postcodes": "Postal codes in scope",
      "hero.locations": "{count} locations",
      "hero.pick": "Pick a location",
      "hero.searchHint": "Search a city or postal code above",
      "weather.aria": "Weather forecast",
      "weather.today": "Today",
      "tab.discover": "🧭 Discover",
      "tab.agenda": "🗓️ My Agenda",
      "tab.favorites": "❤️ Favorites",
      "tab.parameters": "⚙️ Parameters",
      "tab.warnings": "⚠️ Warnings",
      "filter.all": "✨ All",
      "filter.kind.all": "All",
      "filter.kind.event": "Events",
      "filter.kind.activity": "Activities",
      "filter.outdoor": "Outdoor only",
      "results.count": "{count} result in {place}",
      "results.countPlural": "{count} results in {place}",
      "results.yourCity": "your city",
      "empty.noPins.title": "No postal codes selected",
      "empty.noPins.body": "Pin one or more postal codes to explore activities and events.",
      "empty.noFilter.title": "Nothing matches these filters",
      "empty.noFilter.body": 'Try another category or turn off "Outdoor only".',
      "empty.agenda.title": "Your agenda is empty",
      "empty.agenda.body": "Add events and activities from the Discover tab to build your roadmap.",
      "empty.favorites.title": "No favorites yet",
      "empty.favorites.body": "Tap the heart on any card to keep it here.",
      "empty.warnings.title": "No warnings",
      "empty.warnings.body": "Everything looks good for your current selection.",
      "panel.agenda.title": "My Agenda",
      "panel.agenda.hint": "Your hand-picked roadmap, sorted by date. Stored on this device.",
      "panel.favorites.title": "Favorites",
      "panel.favorites.hint": "Everything you loved, saved on this device.",
      "panel.parameters.title": "Parameters",
      "panel.parameters.hint": "Language, color themes and optional API keys — all saved on this device.",
      "panel.warnings.title": "Warnings",
      "panel.warnings.hint": "Service notices and data limitations for your current selection. Tap a warning to dismiss it.",
      "params.lang.title": "Language",
      "params.lang.desc": "Choose the app interface language. Applies immediately.",
      "params.lang.en": "English",
      "params.lang.fr": "Français",
      "params.theme.title": "Color theme",
      "params.theme.desc": "Pick a palette for accents and surfaces. Applies immediately.",
      "params.theme.aria": "Color theme",
      "params.theme.loadError": "Could not load color themes.",
      "params.keys.loadError": "Could not load API key settings. Check your connection and try again.",
      "params.note": "Language, color theme and keys are saved in this browser only. Keys are sent with discover requests; a server-side key (Docker/env) is used when the field is left empty.",
      "params.note.keysOnly": "Color theme and language are saved in this browser. API keys are sent with discover requests when configured.",
      "params.save": "Save & refresh",
      "params.clear": "Clear keys",
      "params.data.title": "Data & cache",
      "params.data.desc": "Clear stored discover results or reset your saved agenda and favorites on this device.",
      "params.data.clearCache": "Clear cached results",
      "params.data.reset": "Reset agenda & favorites",
      "params.cache.confirm": "Clear all cached discover results? Fresh data will be fetched from the server on the next load.",
      "params.reset.confirm": "Remove all items from your agenda and favorites? This cannot be undone.",
      "agenda.export": "Export",
      "agenda.copy": "📋 Copy text",
      "agenda.copyTitle": "Copy agenda as plain text",
      "agenda.ics": "📅 Calendar (.ics)",
      "agenda.icsTitle": "Download iCalendar file",
      "agenda.json": "💾 JSON",
      "agenda.jsonTitle": "Download JSON backup",
      "agenda.exportHint": "Dated items also have a <strong>📅 GCal</strong> button to add them to Google Calendar.",
      "agenda.anytime": "Anytime / flexible",
      "agenda.planned": "{count} planned",
      "agenda.gcal": "📅 GCal",
      "agenda.gcalTitle": "Add to Google Calendar",
      "footer.data": "CityChilly · data from",
      "footer.sources": "curated venue sources. Every card links to its original source.",
      "loading.default": "Finding cool things to do…",
      "loading.updating": "Updating results…",
      "loading.city": "Finding cool things to do in {city}…",
      "loading.pinCity": "Pinning {city}…",
      "card.event": "Event",
      "card.activity": "Activity",
      "card.fav": "Save to favorites",
      "card.inAgenda": "✓ In agenda",
      "card.addAgenda": "+ Add to agenda",
      "card.location": "🌎 Location",
      "card.mapsTitle": "Open in Google Maps",
      "card.link": "🔗 Link",
      "card.linkTitle": "Copy Google Maps link",
      "card.source": "↗ Source",
      "card.sourceTitle": "Source: {name}",
      "card.anytime": "Anytime",
      "wx.great": "Great outdoors",
      "wx.layer": "Bring a layer",
      "wx.indoors": "Better indoors",
      "ac.pin": "+ Pin",
      "ac.pinned": "✓ Pinned",
      "ac.pinAll": "+ Pin all ({count})",
      "ac.allPinned": "✓ All pinned",
      "ac.hint": "Press Enter to pin the whole agglomeration, or pick individual codes below",
      "pin.remove": "Remove {label}",
      "pin.removeGroup": "Remove {city} ({count} postal codes)",
      "toast.warningDismissed": "Warning dismissed",
      "toast.favRemoved": "Removed from favorites",
      "toast.favSaved": "Saved to favorites ❤️",
      "toast.agendaRemoved": "Removed from agenda",
      "toast.agendaAdded": "Added to your agenda 🗓️",
      "toast.mapsCopied": "Google Maps link copied",
      "toast.mapsCopyFail": "Could not copy link",
      "toast.alreadyPinned": "{label} is already pinned",
      "toast.postcodeNotFound": "Could not find postal code {code}",
      "toast.pinned": "Pinned {code}",
      "toast.postcodePinFail": "Could not pin postal code {code}",
      "toast.areaFullyPinned": "{city} is already fully pinned",
      "toast.areaPinFail": "Could not pin postal codes for {city}",
      "toast.areaPinned": "Pinned {count} postal code for {city}",
      "toast.areaPinnedPlural": "Pinned {count} postal codes for {city}",
      "toast.loadPinFail": "Could not load {label}",
      "toast.error": "Something went wrong",
      "toast.pinRemoved": "Removed {label}",
      "toast.theme": "Theme: {label}",
      "toast.lang": "Language: {label}",
      "toast.agendaCopied": "Agenda copied as plain text",
      "toast.agendaCopyFail": "Could not copy agenda",
      "toast.icsDownloaded": "Calendar file downloaded",
      "toast.jsonDownloaded": "JSON file downloaded",
      "toast.paramsSaved": "Parameters saved",
      "toast.keysCleared": "API keys cleared",
      "toast.cacheCleared": "Cached results cleared — refreshing…",
      "toast.cacheClearFail": "Could not reach the server cache, but local results were cleared",
      "toast.resetDone": "Agenda and favorites cleared",
      "results.zero": "0 results",
    },
    fr: {
      "meta.title": "CityChilly · Découvrez votre ville",
      "meta.description": "CityChilly — découvrez activités et événements en plein air pour toute ville, gérez votre agenda et vos favoris.",
      "brand.aria": "Accueil CityChilly",
      "search.aria": "Recherche de lieu",
      "search.placeholder": "Ville ou code postal…",
      "search.submit": "Explorer",
      "search.suggestions": "Suggestions de lieux",
      "theme.toggle": "Basculer clair / sombre",
      "pinned.label": "Codes postaux sélectionnés",
      "pinned.aria": "Codes postaux épinglés",
      "hero.exploring": "Exploration en cours",
      "hero.postcodes": "Codes postaux sélectionnés",
      "hero.locations": "{count} lieux",
      "hero.pick": "Choisissez un lieu",
      "hero.searchHint": "Recherchez une ville ou un code postal ci-dessus",
      "weather.aria": "Prévisions météo",
      "weather.today": "Aujourd'hui",
      "tab.discover": "🧭 Découvrir",
      "tab.agenda": "🗓️ Mon agenda",
      "tab.favorites": "❤️ Favoris",
      "tab.parameters": "⚙️ Paramètres",
      "tab.warnings": "⚠️ Avertissements",
      "filter.all": "✨ Tout",
      "filter.kind.all": "Tout",
      "filter.kind.event": "Événements",
      "filter.kind.activity": "Activités",
      "filter.outdoor": "Plein air uniquement",
      "results.count": "{count} résultat à {place}",
      "results.countPlural": "{count} résultats à {place}",
      "results.yourCity": "votre ville",
      "empty.noPins.title": "Aucun code postal sélectionné",
      "empty.noPins.body": "Épinglez un ou plusieurs codes postaux pour explorer activités et événements.",
      "empty.noFilter.title": "Aucun résultat pour ces filtres",
      "empty.noFilter.body": "Essayez une autre catégorie ou désactivez « Plein air uniquement ».",
      "empty.agenda.title": "Votre agenda est vide",
      "empty.agenda.body": "Ajoutez des événements et activités depuis l'onglet Découvrir.",
      "empty.favorites.title": "Pas encore de favoris",
      "empty.favorites.body": "Touchez le cœur sur une carte pour la garder ici.",
      "empty.warnings.title": "Aucun avertissement",
      "empty.warnings.body": "Tout semble correct pour votre sélection actuelle.",
      "panel.agenda.title": "Mon agenda",
      "panel.agenda.hint": "Votre sélection, triée par date. Enregistrée sur cet appareil.",
      "panel.favorites.title": "Favoris",
      "panel.favorites.hint": "Tout ce que vous avez aimé, enregistré sur cet appareil.",
      "panel.parameters.title": "Paramètres",
      "panel.parameters.hint": "Langue, thèmes de couleur et clés API optionnelles — tout est enregistré sur cet appareil.",
      "panel.warnings.title": "Avertissements",
      "panel.warnings.hint": "Messages du service et limites des données pour votre sélection. Touchez pour ignorer.",
      "params.lang.title": "Langue",
      "params.lang.desc": "Choisissez la langue de l'interface. S'applique immédiatement.",
      "params.lang.en": "English",
      "params.lang.fr": "Français",
      "params.theme.title": "Thème de couleur",
      "params.theme.desc": "Choisissez une palette pour les accents et les surfaces. S'applique immédiatement.",
      "params.theme.aria": "Thème de couleur",
      "params.theme.loadError": "Impossible de charger les thèmes.",
      "params.keys.loadError": "Impossible de charger les clés API. Vérifiez votre connexion.",
      "params.note": "Langue, thème et clés sont enregistrés dans ce navigateur. Les clés sont envoyées avec les requêtes ; une clé serveur (Docker/env) est utilisée si le champ est vide.",
      "params.note.keysOnly": "Langue et thème sont enregistrés dans ce navigateur. Les clés API sont envoyées lors des requêtes si configurées.",
      "params.save": "Enregistrer et actualiser",
      "params.clear": "Effacer les clés",
      "params.data.title": "Données et cache",
      "params.data.desc": "Effacez les résultats en cache ou réinitialisez l'agenda et les favoris enregistrés sur cet appareil.",
      "params.data.clearCache": "Effacer le cache des résultats",
      "params.data.reset": "Réinitialiser agenda et favoris",
      "params.cache.confirm": "Effacer tous les résultats discover en cache ? Les données seront rechargées depuis le serveur.",
      "params.reset.confirm": "Supprimer tous les éléments de l'agenda et des favoris ? Cette action est irréversible.",
      "agenda.export": "Exporter",
      "agenda.copy": "📋 Copier le texte",
      "agenda.copyTitle": "Copier l'agenda en texte brut",
      "agenda.ics": "📅 Calendrier (.ics)",
      "agenda.icsTitle": "Télécharger un fichier iCalendar",
      "agenda.json": "💾 JSON",
      "agenda.jsonTitle": "Télécharger une sauvegarde JSON",
      "agenda.exportHint": "Les éléments datés ont aussi un bouton <strong>📅 GCal</strong> pour Google Calendar.",
      "agenda.anytime": "Flexible / sans date",
      "agenda.planned": "{count} prévu(s)",
      "agenda.gcal": "📅 GCal",
      "agenda.gcalTitle": "Ajouter à Google Calendar",
      "footer.data": "CityChilly · données de",
      "footer.sources": "sources de lieux sélectionnées. Chaque carte renvoie vers sa source.",
      "loading.default": "Recherche d'activités…",
      "loading.updating": "Mise à jour des résultats…",
      "loading.city": "Recherche d'activités à {city}…",
      "loading.pinCity": "Épinglage de {city}…",
      "card.event": "Événement",
      "card.activity": "Activité",
      "card.fav": "Ajouter aux favoris",
      "card.inAgenda": "✓ Dans l'agenda",
      "card.addAgenda": "+ Ajouter à l'agenda",
      "card.location": "🌎 Lieu",
      "card.mapsTitle": "Ouvrir dans Google Maps",
      "card.link": "🔗 Lien",
      "card.linkTitle": "Copier le lien Google Maps",
      "card.source": "↗ Source",
      "card.sourceTitle": "Source : {name}",
      "card.anytime": "À tout moment",
      "wx.great": "Idéal dehors",
      "wx.layer": "Prévoyez une couche",
      "wx.indoors": "Mieux en intérieur",
      "ac.pin": "+ Épingler",
      "ac.pinned": "✓ Épinglé",
      "ac.pinAll": "+ Tout épingler ({count})",
      "ac.allPinned": "✓ Tout épinglé",
      "ac.hint": "Entrée pour épingler toute l'agglomération, ou choisissez des codes ci-dessous",
      "pin.remove": "Retirer {label}",
      "pin.removeGroup": "Retirer {city} ({count} codes postaux)",
      "toast.warningDismissed": "Avertissement ignoré",
      "toast.favRemoved": "Retiré des favoris",
      "toast.favSaved": "Ajouté aux favoris ❤️",
      "toast.agendaRemoved": "Retiré de l'agenda",
      "toast.agendaAdded": "Ajouté à votre agenda 🗓️",
      "toast.mapsCopied": "Lien Google Maps copié",
      "toast.mapsCopyFail": "Impossible de copier le lien",
      "toast.alreadyPinned": "{label} est déjà épinglé",
      "toast.postcodeNotFound": "Code postal {code} introuvable",
      "toast.pinned": "{code} épinglé",
      "toast.postcodePinFail": "Impossible d'épingler {code}",
      "toast.areaFullyPinned": "{city} est déjà entièrement épinglée",
      "toast.areaPinFail": "Impossible d'épingler les codes pour {city}",
      "toast.areaPinned": "{count} code postal épinglé pour {city}",
      "toast.areaPinnedPlural": "{count} codes postaux épinglés pour {city}",
      "toast.loadPinFail": "Impossible de charger {label}",
      "toast.error": "Une erreur s'est produite",
      "toast.pinRemoved": "{label} retiré",
      "toast.theme": "Thème : {label}",
      "toast.lang": "Langue : {label}",
      "toast.agendaCopied": "Agenda copié en texte brut",
      "toast.agendaCopyFail": "Impossible de copier l'agenda",
      "toast.icsDownloaded": "Fichier calendrier téléchargé",
      "toast.jsonDownloaded": "Fichier JSON téléchargé",
      "toast.paramsSaved": "Paramètres enregistrés",
      "toast.keysCleared": "Clés API effacées",
      "toast.cacheCleared": "Cache effacé — actualisation…",
      "toast.cacheClearFail": "Cache serveur inaccessible, mais les résultats locaux ont été effacés",
      "toast.resetDone": "Agenda et favoris effacés",
      "results.zero": "0 résultat",
    },
  };

  const KEYWORDS_FR = {
    Park: "Parc", Garden: "Jardin", "Nature reserve": "Réserve naturelle",
    Playground: "Aire de jeux", "Water park": "Parc aquatique",
    "Swimming pool": "Piscine", "Sports centre": "Centre sportif", Gym: "Salle de sport",
    "Sports pitch": "Terrain", Stadium: "Stade", Marina: "Port de plaisance",
    Museum: "Musée", Gallery: "Galerie", Artwork: "Œuvre d'art", Viewpoint: "Point de vue",
    Zoo: "Zoo", "Theme park": "Parc d'attractions", Aquarium: "Aquarium",
    Attraction: "Attraction", Theatre: "Théâtre", Cinema: "Cinéma",
    "Arts centre": "Centre culturel", Nightclub: "Boîte de nuit", Bar: "Bar", Pub: "Pub",
    "Beer garden": "Brasserie en plein air", Café: "Café", Restaurant: "Restaurant",
    "Food court": "Aire de restauration", Market: "Marché", Fountain: "Fontaine",
    Monument: "Monument", Memorial: "Mémorial", Castle: "Château", Ruins: "Ruines",
    "Archaeological site": "Site archéologique", "Shopping mall": "Centre commercial",
    Beach: "Plage", Peak: "Sommet", Nature: "Nature", Culture: "Culture",
    Music: "Musique", Sports: "Sport", Family: "Famille", "Food & Drink": "Restauration",
    Markets: "Marchés", Festival: "Festival",
  };

  let currentLang = "en";

  function normalizeLang(lang) {
    return lang === "fr" ? "fr" : "en";
  }

  function t(key, vars = {}) {
    const table = MESSAGES[currentLang] || MESSAGES.en;
    let text = table[key] ?? MESSAGES.en[key] ?? key;
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
    return text;
  }

  function translateKeyword(word) {
    if (!word || currentLang !== "fr") return word;
    return KEYWORDS_FR[word] || word;
  }

  function dateLocale() {
    return currentLang === "fr" ? "fr-FR" : undefined;
  }

  function applyStatic(root = document) {
    root.querySelectorAll("[data-i18n]").forEach((node) => {
      const key = node.dataset.i18n;
      if (key) node.textContent = t(key);
    });
    root.querySelectorAll("[data-i18n-html]").forEach((node) => {
      const key = node.dataset.i18nHtml;
      if (key) node.innerHTML = t(key);
    });
    root.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
      const key = node.dataset.i18nPlaceholder;
      if (key) node.placeholder = t(key);
    });
    root.querySelectorAll("[data-i18n-title]").forEach((node) => {
      const key = node.dataset.i18nTitle;
      if (key) node.title = t(key);
    });
    root.querySelectorAll("[data-i18n-aria]").forEach((node) => {
      const key = node.dataset.i18nAria;
      if (key) node.setAttribute("aria-label", t(key));
    });
    document.title = t("meta.title");
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute("content", t("meta.description"));
  }

  function setLang(lang) {
    currentLang = normalizeLang(lang);
    document.documentElement.lang = currentLang;
    applyStatic();
    return currentLang;
  }

  function getLang() {
    return currentLang;
  }

  window.CityChillyI18n = {
    t,
    getLang,
    setLang,
    applyStatic,
    translateKeyword,
    dateLocale,
    SUPPORTED: ["en", "fr"],
  };
})();
