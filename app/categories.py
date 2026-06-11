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

# Short labels used on card headers when no finer-grained OSM keyword is available.
CATEGORY_KEYWORDS: dict[str, str] = {
    "nature": "Nature",
    "culture": "Culture",
    "music": "Music",
    "sports": "Sports",
    "family": "Family",
    "food": "Food & Drink",
    "markets": "Markets",
    "festival": "Festival",
}

# Human-friendly header keywords for common OpenStreetMap tag values.
OSM_VALUE_KEYWORDS: dict[str, str] = {
    "park": "Park",
    "garden": "Garden",
    "nature_reserve": "Nature reserve",
    "playground": "Playground",
    "water_park": "Water park",
    "swimming_pool": "Swimming pool",
    "sports_centre": "Sports centre",
    "fitness_centre": "Gym",
    "pitch": "Sports pitch",
    "stadium": "Stadium",
    "marina": "Marina",
    "museum": "Museum",
    "gallery": "Gallery",
    "artwork": "Artwork",
    "viewpoint": "Viewpoint",
    "zoo": "Zoo",
    "theme_park": "Theme park",
    "aquarium": "Aquarium",
    "attraction": "Attraction",
    "theatre": "Theatre",
    "cinema": "Cinema",
    "arts_centre": "Arts centre",
    "nightclub": "Nightclub",
    "bar": "Bar",
    "pub": "Pub",
    "biergarten": "Beer garden",
    "cafe": "Café",
    "restaurant": "Restaurant",
    "food_court": "Food court",
    "marketplace": "Market",
    "fountain": "Fountain",
    "monument": "Monument",
    "memorial": "Memorial",
    "castle": "Castle",
    "ruins": "Ruins",
    "archaeological_site": "Archaeological site",
    "mall": "Shopping mall",
    "beach": "Beach",
    "peak": "Peak",
    "wood": "Woodland",
    "wetland": "Wetland",
    "dog_park": "Dog park",
    "track": "Running track",
    "ice_rink": "Ice rink",
    "golf_course": "Golf course",
    "picnic_site": "Picnic site",
    "recreation_ground": "Recreation ground",
}

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
    ("natural", "wood", "nature"),
    ("natural", "wetland", "nature"),
    ("leisure", "dog_park", "nature"),
    ("leisure", "track", "sports"),
    ("leisure", "ice_rink", "sports"),
    ("leisure", "golf_course", "sports"),
    ("leisure", "bowling_alley", "sports"),
    ("tourism", "picnic_site", "nature"),
    ("landuse", "recreation_ground", "nature"),
]

# Categories whose items are typically experienced outdoors. Used to attach
# weather suitability hints.
OUTDOOR_CATEGORIES = {"nature", "sports", "markets"}


def category_label(category_id: str) -> str:
    return CATEGORIES.get(category_id, {}).get("label", category_id.title())


def category_keyword(category_id: str, *, kind: str = "activity") -> str:
    """Fallback header keyword from the normalised category (or kind)."""
    if kind == "event" and category_id == "festival":
        return "Festival"
    if kind == "event":
        return CATEGORY_KEYWORDS.get(category_id, category_label(category_id))
    return CATEGORY_KEYWORDS.get(category_id, category_label(category_id))


def _humanize_tag(value: str) -> str:
    return value.replace("_", " ").replace("-", " ").strip().title()


def keyword_from_osm_tags(tags: dict[str, str]) -> str | None:
    """Derive a specific header keyword from raw OSM tags, if possible."""
    for key, value, _category in OSM_TAG_TO_CATEGORY:
        if tags.get(key) == value:
            return OSM_VALUE_KEYWORDS.get(value, _humanize_tag(value))
    if tags.get("shop") == "mall":
        return OSM_VALUE_KEYWORDS["mall"]
    return None


def resolve_keyword(
    *,
    category: str,
    kind: str = "activity",
    osm_tags: dict[str, str] | None = None,
) -> str:
    """Pick the best card-header keyword for an item."""
    if osm_tags:
        specific = keyword_from_osm_tags(osm_tags)
        if specific:
            return specific
    return category_keyword(category, kind=kind)


def is_known_category(category_id: str) -> bool:
    return category_id in CATEGORIES
