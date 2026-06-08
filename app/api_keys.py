"""Optional API keys that users can supply via env vars or the Parameters UI."""
from __future__ import annotations

API_KEY_SPECS: list[dict[str, str]] = [
    {
        "id": "openagenda_key",
        "label": "OpenAgenda API key",
        "description": (
            "Enables live events for any city via OpenAgenda. "
            "Without it, CityChilly shows curated highlights where available."
        ),
        "signup_url": "https://developers.openagenda.com/",
        "env_var": "OPENAGENDA_KEY",
    },
]
