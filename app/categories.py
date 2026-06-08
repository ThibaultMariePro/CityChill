"""Unified category taxonomy shared by activities and events.

Every item surfaced by CityChilly is normalised into one of these categories so
the UI can offer a single, consistent set of filters.
"""
from __future__ import annotations

# id -> human friendly label + emoji used by the UI
CATEGORIES: dict[str, dict[str, str]] = {
    "nature": {"label": "Nature & Outdoors", "emoji": "\U0001F333"},  # tree
    "culture": {"label": "Culture & Arts", "emoji": "\U0001F3DB"},     # classical building
    "music": {"label": "Music & Nightlife", "emoji": "\U0001F3B5"},    # musical note
    "sports": {"label": "Sports & Wellness", "emoji": "\u26BD"},       # soccer ball
    "family": {"label": "Family & Kids", "emoji": "\U0001F9F8"},       # teddy bear
    "food": {"label": "Food & Drink", "emoji": "\U0001F37D"},          # fork/knife plate
    "markets": {"label": "Markets & Shopping", "emoji": "\U0001F6CD"},  # shopping bags
    "festival": {"label": "Festivals & Fairs", "emoji": "\U0001F3AA"}, # circus tent
}

DEFAULT_CATEGORY = "culture"

# Map OpenStreetMap tags (key=value) to our categories. Order matters: the first
# matching rule wins.
OSM_TAG_TO_CATEGORY: list[tuple[str, str, str]] = [
    ("leisure", "park", "nature"),
    ("leisure", "garden", "nature"),
    ("leisure", "nature_reserve", "nature"),
    ("leisure", "playground", "family"),
    ("leisure", "water_park", "family"),
    ("leisure", "swimming_pool", "sports"),
    ("leisure", "sports_centre", "sports"),
    ("leisure", "fitness_centre", "sports"),
    ("leisure", "pitch", "sports"),
    ("leisure", "stadium", "sports"),
    ("leisure", "marina", "nature"),
    ("tourism", "museum", "culture"),
    ("tourism", "gallery", "culture"),
    ("tourism", "artwork", "culture"),
    ("tourism", "viewpoint", "nature"),
    ("tourism", "zoo", "family"),
    ("tourism", "theme_park", "family"),
    ("tourism", "aquarium", "family"),
    ("tourism", "attraction", "culture"),
    ("amenity", "theatre", "culture"),
    ("amenity", "cinema", "culture"),
    ("amenity", "arts_centre", "culture"),
    ("amenity", "nightclub", "music"),
    ("amenity", "bar", "music"),
    ("amenity", "pub", "music"),
    ("amenity", "biergarten", "music"),
    ("amenity", "cafe", "food"),
    ("amenity", "restaurant", "food"),
    ("amenity", "food_court", "food"),
    ("amenity", "marketplace", "markets"),
    ("amenity", "fountain", "culture"),
    ("historic", "monument", "culture"),
    ("historic", "memorial", "culture"),
    ("historic", "castle", "culture"),
    ("historic", "ruins", "culture"),
    ("historic", "archaeological_site", "culture"),
    ("shop", "mall", "markets"),
    ("natural", "beach", "nature"),
    ("natural", "peak", "nature"),
]

# Categories whose items are typically experienced outdoors. Used to attach
# weather suitability hints.
OUTDOOR_CATEGORIES = {"nature", "sports", "markets"}


def category_label(category_id: str) -> str:
    return CATEGORIES.get(category_id, {}).get("label", category_id.title())


def is_known_category(category_id: str) -> bool:
    return category_id in CATEGORIES
