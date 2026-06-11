"""Lightweight UI string translations for the CityChilly API."""
from __future__ import annotations

SUPPORTED_LANGS = frozenset({"en", "fr"})
DEFAULT_LANG = "fr"

CATEGORY_LABELS: dict[str, dict[str, str]] = {
    "en": {
        "nature": "Nature & Outdoors",
        "culture": "Culture & Arts",
        "music": "Music & Nightlife",
        "sports": "Sports & Wellness",
        "family": "Family & Kids",
        "food": "Food & Drink",
        "markets": "Markets & Shopping",
        "festival": "Festivals & Fairs",
    },
    "fr": {
        "nature": "Nature & plein air",
        "culture": "Culture & arts",
        "music": "Musique & vie nocturne",
        "sports": "Sport & bien-être",
        "family": "Famille & enfants",
        "food": "Restauration",
        "markets": "Marchés & shopping",
        "festival": "Festivals & foires",
    },
}

WMO_LABELS: dict[str, dict[int, str]] = {
    "en": {
        0: "Clear sky",
        1: "Mainly clear",
        2: "Partly cloudy",
        3: "Overcast",
        45: "Fog",
        48: "Rime fog",
        51: "Light drizzle",
        53: "Drizzle",
        55: "Heavy drizzle",
        61: "Light rain",
        63: "Rain",
        65: "Heavy rain",
        66: "Freezing rain",
        67: "Freezing rain",
        71: "Light snow",
        73: "Snow",
        75: "Heavy snow",
        77: "Snow grains",
        80: "Rain showers",
        81: "Rain showers",
        82: "Violent showers",
        85: "Snow showers",
        86: "Snow showers",
        95: "Thunderstorm",
        96: "Thunderstorm",
        99: "Thunderstorm",
    },
    "fr": {
        0: "Ciel dégagé",
        1: "Peu nuageux",
        2: "Partiellement nuageux",
        3: "Couvert",
        45: "Brouillard",
        48: "Brouillard givrant",
        51: "Bruine légère",
        53: "Bruine",
        55: "Bruine forte",
        61: "Pluie faible",
        63: "Pluie",
        65: "Forte pluie",
        66: "Pluie verglaçante",
        67: "Pluie verglaçante",
        71: "Neige faible",
        73: "Neige",
        75: "Forte neige",
        77: "Grains de neige",
        80: "Averses",
        81: "Averses",
        82: "Averses violentes",
        85: "Averses de neige",
        86: "Averses de neige",
        95: "Orage",
        96: "Orage",
        99: "Orage",
    },
}


def normalize_lang(lang: str | None) -> str:
    if lang and lang.lower().startswith("fr"):
        return "fr"
    if lang and lang.lower().startswith("en"):
        return "en"
    return DEFAULT_LANG


def category_label(category_id: str, lang: str | None = None) -> str:
    code = normalize_lang(lang)
    return CATEGORY_LABELS[code].get(
        category_id,
        CATEGORY_LABELS["en"].get(category_id, category_id.title()),
    )


def wmo_summary(weather_code: int, lang: str | None = None) -> str:
    lng = normalize_lang(lang)
    labels = WMO_LABELS.get(lng, WMO_LABELS["en"])
    return labels.get(weather_code, WMO_LABELS["en"].get(weather_code, "Unknown"))


def notice_openagenda_auth_failed(lang: str | None = None) -> str:
    if normalize_lang(lang) == "fr":
        return (
            "Clé OpenAgenda refusée par l'API. Vérifiez la clé dans Paramètres "
            "(ou la variable OPENAGENDA_KEY côté serveur)."
        )
    return (
        "OpenAgenda rejected the API key. Check your key in Parameters "
        "(or the OPENAGENDA_KEY server environment variable)."
    )


def notice_openagenda_fallback(city: str, lang: str | None = None) -> str:
    if normalize_lang(lang) == "fr":
        return (
            f"OpenAgenda n'a renvoyé aucun événement en direct pour {city}. "
            "Affichage des temps forts CityChilly à la place."
        )
    return (
        f"OpenAgenda returned no live events for {city}. "
        "Showing CityChilly curated highlights instead."
    )


def notice_live_events_only_empty(city: str, lang: str | None = None) -> str:
    if normalize_lang(lang) == "fr":
        return (
            f"Aucun événement OpenAgenda en direct pour {city} pour l'instant. "
            "Les temps forts CityChilly sont masqués en mode « En direct »."
        )
    return (
        f"No live OpenAgenda events for {city} right now. "
        "CityChilly curated highlights are hidden in Live-only mode."
    )


def notice_live_events_only_no_key(lang: str | None = None) -> str:
    if normalize_lang(lang) == "fr":
        return (
            "Mode « En direct » activé : ajoutez une clé OpenAgenda dans Paramètres "
            "(ou OPENAGENDA_KEY côté serveur) pour récupérer des événements en direct."
        )
    return (
        "Live-only mode is on: add an OpenAgenda key in Parameters "
        "(or OPENAGENDA_KEY on the server) to fetch live events."
    )


def notice_openagenda_no_results(city: str, lang: str | None = None) -> str:
    if normalize_lang(lang) == "fr":
        return (
            f"OpenAgenda n'a renvoyé aucun événement en direct pour {city} "
            "et aucun temps fort CityChilly n'est disponible pour cette ville."
        )
    return (
        f"OpenAgenda returned no live events for {city} and CityChilly has "
        "no curated highlights for this city yet."
    )


def notice_curated_highlights(lang: str | None = None) -> str:
    if normalize_lang(lang) == "fr":
        return (
            "Affichage des temps forts CityChilly pour cette ville. "
            "Ajoutez une clé OpenAgenda dans Paramètres pour récupérer les événements en direct partout."
        )
    return (
        "Showing CityChilly's curated highlights for this city. "
        "Add an OpenAgenda key in Parameters to pull live events anywhere."
    )


def notice_no_event_feed(place_name: str, lang: str | None = None) -> str:
    if normalize_lang(lang) == "fr":
        return (
            f"Aucun flux d'événements pour {place_name} pour l'instant — explorez les "
            "activités ci-dessous (OpenStreetMap), ou ajoutez une clé OpenAgenda dans "
            "Paramètres pour des événements en direct."
        )
    return (
        f"No curated event feed for {place_name} yet — explore the live "
        "Activities below (from OpenStreetMap), or add an OpenAgenda key in "
        "Parameters for live events in any city."
    )


def notice_activities_degraded(lang: str | None = None) -> str:
    if normalize_lang(lang) == "fr":
        return (
            "Les activités en direct sont temporairement indisponibles (le service "
            "OpenStreetMap est saturé). Réessayez dans un instant — cela se résout "
            "généralement en quelques secondes."
        )
    return (
        "Live activities are temporarily unavailable (the OpenStreetMap "
        "service is busy). Please try again in a moment — this usually "
        "fixes itself within seconds."
    )


def notice_no_activities(place_name: str, lang: str | None = None) -> str:
    if normalize_lang(lang) == "fr":
        return (
            f"Aucune activité repérée près de {place_name} pour le moment. "
            "Essayez une ville plus grande ou une autre orthographe."
        )
    return (
        f"We couldn't find tagged activities near {place_name} right now. "
        "Try a larger or differently-spelled city name."
    )


def city_not_found(city: str, lang: str | None = None) -> str:
    if normalize_lang(lang) == "fr":
        return f"Impossible de trouver une ville nommée « {city} »."
    return f"Could not find a city named '{city}'."


def geocode_unavailable(lang: str | None = None) -> str:
    if normalize_lang(lang) == "fr":
        return "Le service de recherche de ville est temporairement indisponible."
    return "City lookup service is temporarily unavailable."
