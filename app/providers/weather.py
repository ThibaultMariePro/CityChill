"""Daily weather forecast via Open-Meteo (keyless).

Used to add an "outdoor suitability" hint to outdoor activities and events.
"""
from __future__ import annotations

from app.config import settings
from app.i18n import normalize_lang, wmo_summary
from app.models import Weather, WeatherDay
from app.providers.http import build_client

# WMO weather interpretation codes -> (summary, emoji)
WMO_CODES: dict[int, tuple[str, str]] = {
    0: ("Clear sky", "\u2600\uFE0F"),
    1: ("Mainly clear", "\U0001F324\uFE0F"),
    2: ("Partly cloudy", "\u26C5"),
    3: ("Overcast", "\u2601\uFE0F"),
    45: ("Fog", "\U0001F32B\uFE0F"),
    48: ("Rime fog", "\U0001F32B\uFE0F"),
    51: ("Light drizzle", "\U0001F326\uFE0F"),
    53: ("Drizzle", "\U0001F326\uFE0F"),
    55: ("Heavy drizzle", "\U0001F327\uFE0F"),
    61: ("Light rain", "\U0001F326\uFE0F"),
    63: ("Rain", "\U0001F327\uFE0F"),
    65: ("Heavy rain", "\U0001F327\uFE0F"),
    66: ("Freezing rain", "\U0001F328\uFE0F"),
    67: ("Freezing rain", "\U0001F328\uFE0F"),
    71: ("Light snow", "\U0001F328\uFE0F"),
    73: ("Snow", "\U0001F328\uFE0F"),
    75: ("Heavy snow", "\u2744\uFE0F"),
    77: ("Snow grains", "\u2744\uFE0F"),
    80: ("Rain showers", "\U0001F326\uFE0F"),
    81: ("Rain showers", "\U0001F327\uFE0F"),
    82: ("Violent showers", "\u26C8\uFE0F"),
    85: ("Snow showers", "\U0001F328\uFE0F"),
    86: ("Snow showers", "\u2744\uFE0F"),
    95: ("Thunderstorm", "\u26C8\uFE0F"),
    96: ("Thunderstorm", "\u26C8\uFE0F"),
    99: ("Thunderstorm", "\u26C8\uFE0F"),
}


def _describe(code: int, *, lang: str = "en") -> tuple[str, str]:
    summary_en, emoji = WMO_CODES.get(code, ("Unknown", "\U0001F300"))
    return wmo_summary(code, lang), emoji


def _outdoor_score(code: int, precip_prob: int | None, tmax: float | None) -> int:
    """Heuristic 0-100 score for how pleasant an outdoor plan would be."""
    score = 100
    # Penalise rain/snow/storm codes.
    if code in {45, 48}:
        score -= 15
    elif code in {51, 53, 61, 80, 71}:
        score -= 35
    elif code in {55, 63, 65, 81, 73, 75, 82}:
        score -= 55
    elif code in {95, 96, 99, 66, 67, 86}:
        score -= 70
    elif code == 3:
        score -= 10

    if precip_prob is not None:
        score -= int(precip_prob * 0.4)

    if tmax is not None:
        if tmax < 3:
            score -= 30
        elif tmax < 8:
            score -= 15
        elif tmax > 34:
            score -= 20

    return max(0, min(100, score))


async def get_weather(latitude: float, longitude: float, *, lang: str = "en") -> Weather:
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,"
        "precipitation_probability_max",
        "forecast_days": settings.FORECAST_DAYS,
        "timezone": "auto",
    }
    source_url = (
        f"https://open-meteo.com/en/docs?latitude={latitude}&longitude={longitude}"
    )
    try:
        async with build_client() as client:
            resp = await client.get(settings.WEATHER_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        return Weather(source_url=source_url, days=[])

    daily = data.get("daily", {})
    dates = daily.get("time", [])
    codes = daily.get("weather_code", [])
    tmax = daily.get("temperature_2m_max", [])
    tmin = daily.get("temperature_2m_min", [])
    precip = daily.get("precipitation_probability_max", [])

    days: list[WeatherDay] = []
    for i, date in enumerate(dates):
        code = codes[i] if i < len(codes) else 0
        summary, emoji = _describe(code, lang=lang)
        day_tmax = tmax[i] if i < len(tmax) else None
        day_tmin = tmin[i] if i < len(tmin) else None
        day_precip = precip[i] if i < len(precip) else None
        days.append(
            WeatherDay(
                date=date,
                weather_code=code,
                summary=summary,
                emoji=emoji,
                temp_max=day_tmax,
                temp_min=day_tmin,
                precipitation_probability=day_precip,
                outdoor_score=_outdoor_score(code, day_precip, day_tmax),
            )
        )

    return Weather(source_url=source_url, days=days)
