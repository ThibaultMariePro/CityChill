"""Application configuration loaded from environment variables."""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings:
    """Runtime settings. All values can be overridden through env vars."""

    # --- General ---
    APP_NAME: str = "CityChilly"
    DEFAULT_CITY: str = os.getenv("CITYCHILLY_DEFAULT_CITY", "Nantes")
    DEFAULT_COUNTRY: str = os.getenv("CITYCHILLY_DEFAULT_COUNTRY", "France")

    # --- Theme / color palette ---
    THEME_CONFIG_PATH: str = os.getenv(
        "CITYCHILLY_THEME_CONFIG", str(BASE_DIR / "config" / "theme.json")
    )
    # Optional override of the palette selected in the config file.
    ACTIVE_PALETTE: str | None = os.getenv("CITYCHILLY_ACTIVE_PALETTE") or None

    # --- Networking ---
    HTTP_TIMEOUT: float = float(os.getenv("CITYCHILLY_HTTP_TIMEOUT", "20"))
    # Overpass can be slow; give it a longer per-request budget.
    OVERPASS_TIMEOUT: float = float(os.getenv("CITYCHILLY_OVERPASS_TIMEOUT", "30"))
    USER_AGENT: str = os.getenv(
        "CITYCHILLY_USER_AGENT",
        "CityChilly/1.0 (+https://github.com/citychilly)",
    )

    # --- Cache ---
    CACHE_TTL_SECONDS: int = int(os.getenv("CITYCHILLY_CACHE_TTL", "1800"))

    # --- External providers (all optional / keyless by default) ---
    GEOCODE_URL: str = "https://geocoding-api.open-meteo.com/v1/search"
    WEATHER_URL: str = "https://api.open-meteo.com/v1/forecast"

    # Overpass is a free, community-run service whose public endpoints regularly
    # rate-limit or time out. We therefore try several mirrors in order. Override
    # with a comma-separated CITYCHILLY_OVERPASS_URLS env var.
    OVERPASS_URLS: list[str] = [
        u.strip()
        for u in os.getenv(
            "CITYCHILLY_OVERPASS_URLS",
            ",".join(
                [
                    "https://overpass.openstreetmap.fr/api/interpreter",
                    "https://overpass-api.de/api/interpreter",
                    "https://overpass.private.coffee/api/interpreter",
                ]
            ),
        ).split(",")
        if u.strip()
    ]

    # OpenAgenda is optional. When configured, live events are fetched for any
    # city. Without it, CityChilly falls back to its curated dataset.
    OPENAGENDA_KEY: str | None = os.getenv("OPENAGENDA_KEY") or None

    # How many days ahead to look for events / weather (Open-Meteo max is 16).
    FORECAST_DAYS: int = min(int(os.getenv("CITYCHILLY_FORECAST_DAYS", "16")), 16)
    EVENT_HORIZON_DAYS: int = int(os.getenv("CITYCHILLY_EVENT_HORIZON_DAYS", "28"))

    # Discover pagination — full upstream fetch is cached, then sliced per page.
    DISCOVER_PAGE_SIZE: int = int(os.getenv("CITYCHILLY_DISCOVER_PAGE_SIZE", "40"))
    DISCOVER_MAX_ACTIVITIES: int = int(
        os.getenv("CITYCHILLY_DISCOVER_MAX_ACTIVITIES", "200")
    )
    DISCOVER_MAX_EVENTS: int = int(os.getenv("CITYCHILLY_DISCOVER_MAX_EVENTS", "800"))


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
