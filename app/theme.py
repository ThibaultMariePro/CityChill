"""Load the user-editable color palette config and turn it into CSS.

The palette is defined in ``config/theme.json`` (override the path with
CITYCHILLY_THEME_CONFIG). The selected palette is emitted as CSS custom
properties that override the defaults in ``web/styles.css``.
"""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path

from app.config import settings

log = logging.getLogger(__name__)

# Fallback palette if the config file is missing or invalid.
_DEFAULT_CONFIG: dict = {
    "active": "sunset",
    "palettes": {
        "sunset": {
            "label": "Sunset (warm, default)",
            "brand": {
                "coral": "#ff7a59",
                "coral-deep": "#f0572f",
                "amber": "#ffb547",
                "rose": "#ff5d8f",
                "plum": "#7c5cff",
                "teal": "#2bb6a3",
            },
        }
    },
}

# Only allow safe characters in color values to avoid CSS injection.
_SAFE_VALUE = re.compile(r"^[#a-zA-Z0-9 ,.%()\-/]+$")


def load_config() -> dict:
    path = Path(settings.THEME_CONFIG_PATH)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict) and data.get("palettes"):
            return data
        log.warning(
            "theme.json at %s is missing a 'palettes' key — using built-in defaults",
            path,
        )
    except FileNotFoundError:
        log.warning(
            "theme.json not found at %s — using built-in defaults. "
            "Set CITYCHILLY_THEME_CONFIG to the correct path if needed.",
            path,
        )
    except json.JSONDecodeError as exc:
        log.warning("theme.json at %s is not valid JSON (%s) — using built-in defaults", path, exc)
    except Exception as exc:
        log.warning("Could not read theme.json at %s (%s) — using built-in defaults", path, exc)
    return _DEFAULT_CONFIG


def _active_id(config: dict) -> str:
    palettes = config.get("palettes", {})
    candidate = settings.ACTIVE_PALETTE or config.get("active")
    if candidate in palettes:
        return candidate
    return next(iter(palettes), "sunset")


def active_palette(config: dict | None = None) -> tuple[str, dict]:
    config = config or load_config()
    pid = _active_id(config)
    return pid, config.get("palettes", {}).get(pid, {})


def list_palettes(config: dict | None = None) -> list[dict]:
    config = config or load_config()
    return [
        {"id": pid, "label": pal.get("label", pid.title())}
        for pid, pal in config.get("palettes", {}).items()
    ]


def _emit_vars(mapping: dict) -> str:
    lines = []
    for key, value in (mapping or {}).items():
        value = str(value).strip()
        key = str(key).strip()
        if not value or not _SAFE_VALUE.match(value):
            continue
        if not re.match(r"^[a-zA-Z0-9\-]+$", key):
            continue
        lines.append(f"  --{key}: {value};")
    return "\n".join(lines)


def generate_css() -> str:
    """Build the CSS that recolors the app for the active palette."""
    config = load_config()
    pid, palette = active_palette(config)
    label = palette.get("label", pid)
    config_path = Path(settings.THEME_CONFIG_PATH)

    blocks: list[str] = [
        f"/* CityChilly active palette: {pid} — {label} */\n"
        f"/* config: {config_path} */",
    ]

    brand = _emit_vars(palette.get("brand", {}))
    if brand:
        blocks.append(":root {\n" + brand + "\n}")

    light = _emit_vars(palette.get("light", {}))
    if light:
        blocks.append('[data-theme="light"] {\n' + light + "\n}")

    dark = _emit_vars(palette.get("dark", {}))
    if dark:
        blocks.append('[data-theme="dark"] {\n' + dark + "\n}")

    return "\n\n".join(blocks) + "\n"
