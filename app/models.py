"""Pydantic response models for the CityChilly API."""
from __future__ import annotations

from pydantic import BaseModel, Field


class Place(BaseModel):
    name: str
    country: str | None = None
    admin: str | None = None
    admin2: str | None = None
    admin3: str | None = None
    latitude: float
    longitude: float
    timezone: str | None = None
    source_url: str


class WeatherDay(BaseModel):
    date: str
    weather_code: int
    summary: str
    emoji: str
    temp_max: float | None = None
    temp_min: float | None = None
    precipitation_probability: int | None = None
    outdoor_score: int = Field(0, description="0-100 suitability for outdoor plans")


class Weather(BaseModel):
    source_url: str
    days: list[WeatherDay] = []


class WeatherHint(BaseModel):
    date: str
    emoji: str
    summary: str
    outdoor_score: int
    temp_max: float | None = None


class Item(BaseModel):
    """A single activity or event card."""

    id: str
    kind: str  # "activity" | "event"
    title: str
    category: str
    keyword: str | None = None  # short type label shown on the card header (e.g. "Restaurant")
    description: str | None = None
    image_url: str | None = None
    location_name: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    start: str | None = None  # ISO date for events
    end: str | None = None
    is_outdoor: bool = False
    source_name: str
    source_url: str  # every item MUST have a clickable source
    tags: list[str] = []
    # Weather context attached for outdoor items (when a forecast is available)
    weather: WeatherHint | None = None


class PlaceSuggestion(BaseModel):
    """Lightweight geocoding result used by the search autocomplete."""

    id: str  # "pc:44100" for a postal code, or "<lat>,<lon>" for a generic place
    name: str
    display: str  # "44100 · Nantes" or "Nantes, Pays de la Loire, France"
    kind: str = "place"  # "postcode" | "area" | "place"
    postcode: str | None = None  # set when kind == "postcode"
    country: str | None = None
    country_code: str | None = None
    admin1: str | None = None
    latitude: float
    longitude: float
    timezone: str | None = None
    population: int | None = None
    postcodes: list[str] = []  # for kind=="area": selectable codes in the agglomeration


class DiscoverResponse(BaseModel):
    place: Place
    weather: Weather
    activities: list[Item] = []
    events: list[Item] = []
    notices: list[str] = []
