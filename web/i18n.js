/* CityChilly UI translations (en / fr) */
(() => {
  "use strict";

  const MESSAGES = {
    en: {
      "meta.title": "CityChilly · Discover your city",
      "meta.description": "CityChilly - discover activities and outdoor events for any city, manage your agenda and save favorites.",
      "brand.aria": "CityChilly home",
      "status.checking": "Checking connection…",
      "status.ok": "API connected · OpenAgenda key valid",
      "status.apiDown": "Cannot reach CityChilly API",
      "status.keyFail": "OpenAgenda API key missing or invalid",
      "search.aria": "Location search",
      "search.placeholder": "City or postal code…",
      "search.submit": "Explore",
      "search.suggestions": "Location suggestions",
      "theme.toggle": "Toggle light / dark",
      "pinned.label": "In scope",
      "pinned.aria": "Pinned locations",
      "activitySearch.aria": "Search activities and events",
      "activitySearch.placeholder": "Search activities & events…",
      "activitySearch.clear": "Clear keyword search",
      "hero.exploring": "Now exploring",
      "hero.postcodes": "Postal codes in scope",
      "hero.locations": "{count} locations",
      "hero.pick": "Pick a location",
      "hero.searchHint": "Search a city or postal code above",
      "weather.aria": "Weather forecast",
      "weather.today": "Today",
      "tab.discover": "🧭 Discover",
      "tab.zones": "📍 My zones",
      "tab.agenda": "🗓️ My Agenda",
      "tab.favorites": "❤️ Favorites",
      "tab.parameters": "⚙️ Parameters",
      "tab.warnings": "⚠️ Warnings",
      "filter.all": "✨ All",
      "filter.kind.all": "All",
      "filter.kind.event": "Events",
      "filter.kind.activity": "Activities",
      "filter.outdoor": "Outdoor only",
      "filter.refresh": "Refresh",
      "filter.refreshTitle": "Re-fetch live events from OpenAgenda for the current search",
      "filter.live": "Live only",
      "filter.liveTitle": "Fetch only OpenAgenda events and hide curated highlights",
      "filter.liveNoKey": "Add an OpenAgenda API key in Parameters to enable live-only mode",
      "filter.hotToday": "Hot today",
      "filter.hotTodayTitle": "Live OpenAgenda events happening today only (single-day, not multi-day)",
      "filter.hotWeek": "Hot this week",
      "filter.hotWeekTitle": "Live OpenAgenda events ending within the next 7 days",
      "filter.time.today": "Today",
      "filter.time.hotWeek": "Ending this week",
      "filter.time.aria": "Filter events by period",
      "filter.time.all": "All events",
      "filter.time.week": "This week",
      "filter.time.month": "This month",
      "filter.time.quarter": "Next 3 months",
      "filter.zone.aria": "Filter by saved zone",
      "filter.zone.custom": "Custom search",
      "filter.zone.all": "All pinned locations",
      "results.count": "{count} result in {place}",
      "results.countPlural": "{count} results in {place}",
      "results.live": "{count} live",
      "results.curated": "{count} highlights",
      "results.activities": "{count} activities",
      "results.filterHidesLive": "{count} live OpenAgenda events are loaded but hidden by your filters (try turning off Outdoor only or widening the date range).",
      "results.yourCity": "your city",
      "results.loadMore": "Load more",
      "results.loadedOf": "{loaded} of {total} loaded",
      "loading.more": "Loading more…",
      "empty.noPins.title": "No postal codes selected",
      "empty.noPins.body": "Pin one or more postal codes to explore activities and events.",
      "empty.noFilter.title": "Nothing matches these filters",
      "empty.noFilter.body": 'Try another category, a different time period, or turn off "Outdoor only".',
      "empty.noKeyword.title": 'No results for "{keyword}"',
      "empty.noKeyword.body": "Try a shorter keyword, another spelling, or load more events below.",
      "empty.agenda.title": "Your agenda is empty",
      "empty.agenda.body": "Add events and activities from the Discover tab to build your roadmap.",
      "empty.favorites.title": "No favorites yet",
      "empty.favorites.body": "Tap the heart on any card to keep it here.",
      "empty.warnings.title": "No warnings",
      "empty.warnings.body": "Everything looks good for your current selection.",
      "empty.zones.title": "No saved zones yet",
      "empty.zones.body": "Pin cities on Discover, then save the selection here for quick access later.",
      "panel.zones.title": "My zones",
      "panel.zones.hint": "Save grouped city searches and switch between them from Discover.",
      "zones.saveLabel": "Zone name",
      "zones.savePlaceholder": "e.g. Pays de la Loire",
      "zones.save": "Save current pins",
      "zones.saveHint": "Pin one or more cities or postal codes first, then save them as a zone.",
      "zones.pins": "{count} locations",
      "zones.load": "Load",
      "zones.update": "Update",
      "zones.delete": "Delete",
      "zones.deleteConfirm": "Delete zone “{name}”? This cannot be undone.",
      "zones.updateConfirm": "Replace “{name}” with your current pinned locations?",
      "toast.zoneSaved": "Zone “{name}” saved",
      "toast.zoneLoaded": "Zone “{name}” loaded",
      "toast.zoneUpdated": "Zone “{name}” updated",
      "toast.zoneDeleted": "Zone “{name}” deleted",
      "toast.zoneNeedsPins": "Pin at least one location before saving a zone",
      "toast.zoneNameRequired": "Enter a name for the zone",
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
      "params.keys.title": "API keys",
      "params.keys.desc": "Optional keys sent with discover requests from this browser. Leave empty to use the server key.",
      "params.keys.loadError": "Could not load API key settings. Check your connection and try again.",
      "params.note": "Language, color theme and keys are saved in this browser only. Leave the OpenAgenda field empty to use the server key (.env / Docker). A browser key overrides the server key only when saved and verified.",
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
      "footer.sources": "curated venue sources.",
      "loading.default": "Finding cool things to do…",
      "loading.wait": "This may take a few seconds…",
      "loading.places": "Finding places to visit…",
      "loading.events": "Loading live events…",
      "loading.filterMore": "Loading more matching results…",
      "loading.updating": "Updating results…",
      "loading.refresh": "Refreshing OpenAgenda events…",
      "loading.city": "Finding cool things to do in {city}…",
      "loading.pinCity": "Pinning {city}…",
      "card.ends": "ends {day}",
      "card.event": "Event",
      "card.activity": "Activity",
      "card.curatedHint": "CityChilly curated highlight — not a live OpenAgenda event",
      "card.liveHint": "Live event from OpenAgenda",
      "card.fav": "Save to favorites",
      "card.inAgenda": "✓ In agenda",
      "card.addAgenda": "+ Add to agenda",
      "card.location": "🌎 Location",
      "card.mapsTitle": "Open in Google Maps",
      "card.link": "🔗 Link",
      "card.linkTitle": "Copy Google Maps link",
      "card.search": "🔍 Search",
      "card.searchTitle": "Search the web for “{query}”",
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
      "toast.paramsSaved": "Parameters saved — using server API key",
      "toast.keyValid": "OpenAgenda key saved and verified",
      "toast.keyInvalid": "OpenAgenda key rejected — not saved",
      "toast.keyMalformed": "That does not look like an OpenAgenda key (expected oa_…)",
      "toast.keyMissing": "Parameters saved — no working OpenAgenda key found",
      "toast.keysClearedServer": "Browser keys cleared — using server API key",
      "toast.keysCleared": "API keys cleared",
      "toast.hotTodayOn": "Hot today — live events happening now…",
      "toast.hotTodayOff": "Hot today filter turned off",
      "toast.hotWeekOn": "Hot this week — live events ending soon…",
      "toast.hotWeekOff": "Hot this week filter turned off",
      "toast.liveOn": "Live only — refreshing OpenAgenda events…",
      "toast.refreshDone": "OpenAgenda results refreshed",
      "toast.refreshNoPins": "Pin a location first to refresh events",
      "toast.liveOff": "Showing curated highlights again",
      "toast.cacheCleared": "Cached results cleared — refreshing…",
      "toast.cacheClearFail": "Could not reach the server cache, but local results were cleared",
      "toast.resetDone": "Agenda and favorites cleared",
      "results.zero": "0 results",
    },
    fr: {
      "meta.title": "CityChilly · Découvrez votre ville",
      "meta.description": "CityChilly — découvrez activités et événements en plein air pour toute ville, gérez votre agenda et vos favoris.",
      "brand.aria": "Accueil CityChilly",
      "status.checking": "Vérification de la connexion…",
      "status.ok": "API connectée · clé OpenAgenda valide",
      "status.apiDown": "Impossible de joindre l'API CityChilly",
      "status.keyFail": "Clé OpenAgenda absente ou invalide",
      "search.aria": "Recherche de lieu",
      "search.placeholder": "Ville ou code postal…",
      "search.submit": "Explorer",
      "search.suggestions": "Suggestions de lieux",
      "theme.toggle": "Basculer clair / sombre",
      "pinned.label": "À portée",
      "pinned.aria": "Lieux épinglés",
      "activitySearch.aria": "Rechercher activités et événements",
      "activitySearch.placeholder": "Rechercher activités et événements…",
      "activitySearch.clear": "Effacer la recherche",
      "hero.exploring": "Exploration en cours",
      "hero.postcodes": "Codes postaux sélectionnés",
      "hero.locations": "{count} lieux",
      "hero.pick": "Choisissez un lieu",
      "hero.searchHint": "Recherchez une ville ou un code postal ci-dessus",
      "weather.aria": "Prévisions météo",
      "weather.today": "Aujourd'hui",
      "tab.discover": "🧭 Découvrir",
      "tab.zones": "📍 Mes zones",
      "tab.agenda": "🗓️ Mon agenda",
      "tab.favorites": "❤️ Favoris",
      "tab.parameters": "⚙️ Paramètres",
      "tab.warnings": "⚠️ Avertissements",
      "filter.all": "✨ Tout",
      "filter.kind.all": "Tout",
      "filter.kind.event": "Événements",
      "filter.kind.activity": "Activités",
      "filter.outdoor": "Plein air uniquement",
      "filter.refresh": "Actualiser",
      "filter.refreshTitle": "Relancer la recherche OpenAgenda pour la sélection actuelle",
      "filter.live": "En direct",
      "filter.liveTitle": "Récupérer uniquement les événements OpenAgenda, sans temps forts CityChilly",
      "filter.liveNoKey": "Ajoutez une clé OpenAgenda dans Paramètres pour activer le mode En direct",
      "filter.hotToday": "Chaud aujourd'hui",
      "filter.hotTodayTitle": "Événements OpenAgenda en direct uniquement aujourd'hui (un jour, pas sur plusieurs jours)",
      "filter.hotWeek": "Chaud cette semaine",
      "filter.hotWeekTitle": "Événements OpenAgenda en direct qui se terminent dans les 7 prochains jours",
      "filter.time.hotWeek": "Fin cette semaine",
      "filter.time.today": "Aujourd'hui",
      "filter.time.aria": "Filtrer les événements par période",
      "filter.time.all": "Tous les événements",
      "filter.time.week": "Cette semaine",
      "filter.time.month": "Ce mois-ci",
      "filter.time.quarter": "3 prochains mois",
      "filter.zone.aria": "Filtrer par zone enregistrée",
      "filter.zone.custom": "Recherche libre",
      "filter.zone.all": "Tous les lieux épinglés",
      "results.count": "{count} résultat à {place}",
      "results.countPlural": "{count} résultats à {place}",
      "results.live": "{count} en direct",
      "results.curated": "{count} temps forts",
      "results.activities": "{count} activités",
      "results.filterHidesLive": "{count} événements OpenAgenda en direct sont chargés mais masqués par vos filtres (désactivez « Plein air » ou élargissez la période).",
      "results.yourCity": "votre ville",
      "results.loadMore": "Charger plus",
      "results.loadedOf": "{loaded} sur {total} chargés",
      "loading.more": "Chargement…",
      "empty.noPins.title": "Aucun code postal sélectionné",
      "empty.noPins.body": "Épinglez un ou plusieurs codes postaux pour explorer activités et événements.",
      "empty.noFilter.title": "Aucun résultat pour ces filtres",
      "empty.noFilter.body": "Essayez une autre catégorie, une autre période ou désactivez « Plein air uniquement ».",
      "empty.noKeyword.title": "Aucun résultat pour « {keyword} »",
      "empty.noKeyword.body": "Essayez un mot-clé plus court, une autre orthographe, ou chargez plus d'événements ci-dessous.",
      "empty.agenda.title": "Votre agenda est vide",
      "empty.agenda.body": "Ajoutez des événements et activités depuis l'onglet Découvrir.",
      "empty.favorites.title": "Pas encore de favoris",
      "empty.favorites.body": "Touchez le cœur sur une carte pour la garder ici.",
      "empty.warnings.title": "Aucun avertissement",
      "empty.warnings.body": "Tout semble correct pour votre sélection actuelle.",
      "empty.zones.title": "Aucune zone enregistrée",
      "empty.zones.body": "Épinglez des villes dans Découvrir, puis enregistrez la sélection ici.",
      "panel.zones.title": "Mes zones",
      "panel.zones.hint": "Enregistrez des recherches groupées et basculez entre elles depuis Découvrir.",
      "zones.saveLabel": "Nom de la zone",
      "zones.savePlaceholder": "ex. Pays de la Loire",
      "zones.save": "Enregistrer les épingles",
      "zones.saveHint": "Épinglez une ou plusieurs villes ou codes postaux, puis enregistrez-les comme zone.",
      "zones.pins": "{count} lieux",
      "zones.load": "Charger",
      "zones.update": "Mettre à jour",
      "zones.delete": "Supprimer",
      "zones.deleteConfirm": "Supprimer la zone « {name} » ? Cette action est irréversible.",
      "zones.updateConfirm": "Remplacer « {name} » par vos épingles actuelles ?",
      "toast.zoneSaved": "Zone « {name} » enregistrée",
      "toast.zoneLoaded": "Zone « {name} » chargée",
      "toast.zoneUpdated": "Zone « {name} » mise à jour",
      "toast.zoneDeleted": "Zone « {name} » supprimée",
      "toast.zoneNeedsPins": "Épinglez au moins un lieu avant d'enregistrer une zone",
      "toast.zoneNameRequired": "Donnez un nom à la zone",
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
      "params.keys.title": "Clés API",
      "params.keys.desc": "Clés optionnelles envoyées avec les requêtes depuis ce navigateur. Laissez vide pour utiliser la clé serveur.",
      "params.keys.loadError": "Impossible de charger les clés API. Vérifiez votre connexion.",
      "params.note": "Langue, thème et clés sont enregistrés dans ce navigateur. Laissez le champ OpenAgenda vide pour utiliser la clé serveur (.env / Docker). Une clé navigateur ne remplace la clé serveur qu'une fois enregistrée et vérifiée.",
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
      "footer.sources": "sources de lieux sélectionnées.",
      "loading.default": "Recherche d'activités…",
      "loading.wait": "Cela peut prendre quelques secondes…",
      "loading.places": "Recherche de lieux à visiter…",
      "loading.events": "Chargement des événements en direct…",
      "loading.filterMore": "Chargement de résultats correspondants…",
      "loading.updating": "Mise à jour des résultats…",
      "loading.refresh": "Actualisation des événements OpenAgenda…",
      "loading.city": "Recherche d'activités à {city}…",
      "loading.pinCity": "Épinglage de {city}…",
      "card.ends": "fin {day}",
      "card.event": "Événement",
      "card.activity": "Activité",
      "card.curatedHint": "Temps fort CityChilly — pas un événement OpenAgenda en direct",
      "card.liveHint": "Événement en direct via OpenAgenda",
      "card.fav": "Ajouter aux favoris",
      "card.inAgenda": "✓ Dans l'agenda",
      "card.addAgenda": "+ Ajouter à l'agenda",
      "card.location": "🌎 Lieu",
      "card.mapsTitle": "Ouvrir dans Google Maps",
      "card.link": "🔗 Lien",
      "card.linkTitle": "Copier le lien Google Maps",
      "card.search": "🔍 Rechercher",
      "card.searchTitle": "Rechercher « {query} » sur le web",
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
      "toast.paramsSaved": "Paramètres enregistrés — clé serveur utilisée",
      "toast.keyValid": "Clé OpenAgenda enregistrée et vérifiée",
      "toast.keyInvalid": "Clé OpenAgenda refusée — non enregistrée",
      "toast.keyMalformed": "Cela ne ressemble pas à une clé OpenAgenda (format oa_…)",
      "toast.keyMissing": "Paramètres enregistrés — aucune clé OpenAgenda valide",
      "toast.keysClearedServer": "Clés navigateur effacées — clé serveur utilisée",
      "toast.keysCleared": "Clés API effacées",
      "toast.hotTodayOn": "Chaud aujourd'hui — événements en direct du jour…",
      "toast.hotTodayOff": "Filtre Chaud aujourd'hui désactivé",
      "toast.hotWeekOn": "Chaud cette semaine — événements qui se terminent bientôt…",
      "toast.hotWeekOff": "Filtre Chaud cette semaine désactivé",
      "toast.liveOn": "Mode En direct — actualisation OpenAgenda…",
      "toast.refreshDone": "Événements OpenAgenda actualisés",
      "toast.refreshNoPins": "Épinglez un lieu pour actualiser les événements",
      "toast.liveOff": "Affichage des temps forts CityChilly à nouveau",
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

  let currentLang = "fr";

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

  let dayFormatter = null;
  let weekdayFormatter = null;
  let dateTimeFormatter = null;

  function resetDateFormatters() {
    dayFormatter = null;
    weekdayFormatter = null;
    dateTimeFormatter = null;
  }

  function dateLocale() {
    return currentLang === "fr" ? "fr-FR" : "en-GB";
  }

  function parseISODateLocal(iso) {
    const [y, m, d] = String(iso).split("T")[0].split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function formatDay(iso) {
    if (!iso) return "";
    if (!dayFormatter) {
      dayFormatter = new Intl.DateTimeFormat(dateLocale(), {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    }
    return dayFormatter.format(parseISODateLocal(iso));
  }

  function formatWeekday(iso) {
    if (!weekdayFormatter) {
      weekdayFormatter = new Intl.DateTimeFormat(dateLocale(), { weekday: "short" });
    }
    return weekdayFormatter.format(parseISODateLocal(iso));
  }

  function formatDateTime(date = new Date()) {
    if (!dateTimeFormatter) {
      dateTimeFormatter = new Intl.DateTimeFormat(dateLocale(), {
        dateStyle: "medium",
        timeStyle: "short",
      });
    }
    return dateTimeFormatter.format(date);
  }

  function formatRange(start, end) {
    if (!start) return "";
    if (!end || end === start) return formatDay(start);
    return `${formatDay(start)} – ${formatDay(end)}`;
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
    resetDateFormatters();
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
    formatDay,
    formatWeekday,
    formatDateTime,
    formatRange,
    SUPPORTED: ["en", "fr"],
  };
})();
