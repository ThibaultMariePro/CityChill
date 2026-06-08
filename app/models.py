"""Pydantic response models for the CityChilly API."""
from __future__ import annotations

from pydantic import BaseModel, Field


class Place(BaseModel):
    name: str
    country: str | None = None
    admin: str | None = None
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

    id: str  # stable "<lat>,<lon>" string, consistent across name vs. coordinate lookups
    name: str
    display: str  # "Nantes, Pays de la Loire, France"
    country: str | None = None
    country_code: str | None = None
    admin1: str | None = None
    latitude: float
    longitude: float
    timezone: str | None = None
    population: int | None = None
    postcodes: list[str] = []


class DiscoverResponse(BaseModel):
    place: Place
    weather: Weather
    activities: list[Item] = []
    events: list[Item] = []
    notices: list[str] = []
