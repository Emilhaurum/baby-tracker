"""The Baby Tracker integration: log diapers, feedings and sleep."""

from __future__ import annotations

from datetime import date

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .const import CONF_BIRTH_DATE, DOMAIN
from .frontend import async_register_frontend
from .services import async_setup_services
from .tracker import BabyTracker
from .websocket import async_setup_websocket

PLATFORMS: list[Platform] = [
    Platform.BUTTON,
    Platform.CALENDAR,
    Platform.NUMBER,
    Platform.SENSOR,
    Platform.SWITCH,
    Platform.TIME,
]

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

type BabyTrackerConfigEntry = ConfigEntry[BabyTracker]


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the services, websocket API and dashboard card."""
    async_setup_services(hass)
    async_setup_websocket(hass)
    await async_register_frontend(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: BabyTrackerConfigEntry) -> bool:
    """Set up a baby from a config entry."""
    birth_date = entry.data.get(CONF_BIRTH_DATE)
    tracker = BabyTracker(
        hass, entry.entry_id, entry.title, date.fromisoformat(birth_date) if birth_date else None
    )
    await tracker.async_load()
    entry.runtime_data = tracker
    entry.async_on_unload(tracker.async_unload)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    # Refresh dashboards that were subscribed before a reload.
    tracker.async_notify()
    return True


async def async_unload_entry(hass: HomeAssistant, entry: BabyTrackerConfigEntry) -> bool:
    """Unload a config entry."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def async_remove_entry(hass: HomeAssistant, entry: BabyTrackerConfigEntry) -> None:
    """Delete the stored history when a baby is removed."""
    await BabyTracker(hass, entry.entry_id, entry.title).async_remove()
