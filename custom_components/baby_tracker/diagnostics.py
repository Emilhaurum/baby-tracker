"""Diagnostics for Baby Tracker."""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant

from . import BabyTrackerConfigEntry


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: BabyTrackerConfigEntry
) -> dict[str, Any]:
    """Return diagnostics without the baby's name."""
    return {
        "entry": {"version": entry.version, "minor_version": entry.minor_version},
        "tracker": entry.runtime_data.diagnostics(),
    }
