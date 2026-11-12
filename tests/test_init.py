"""Tests for setup, unload, storage and the served card."""

from __future__ import annotations

from typing import Any

from homeassistant.components.frontend import DATA_EXTRA_MODULE_URL
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.baby_tracker.const import DOMAIN

from .helpers import call


async def test_setup_and_unload(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    assert entry.state is ConfigEntryState.LOADED
    assert hass.services.has_service(DOMAIN, "log_diaper")
    assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.NOT_LOADED


async def test_data_persists(
    hass: HomeAssistant, entry: MockConfigEntry, hass_storage: dict[str, Any]
) -> None:
    await call(hass, "log_diaper", type="dirty")
    await call(hass, "start_sleep")
    await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()

    stored = hass_storage[f"{DOMAIN}.{entry.entry_id}"]["data"]
    assert stored["events"][0]["diaper_type"] == "dirty"
    assert stored["sleep_start"] is not None

    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert hass.states.get("sensor.alex_last_diaper_type").state == "dirty"
    assert hass.states.get("switch.alex_sleeping").state == "on"


async def test_loads_settings(
    hass: HomeAssistant, mock_entry: MockConfigEntry, hass_storage: dict[str, Any]
) -> None:
    hass_storage[f"{DOMAIN}.{mock_entry.entry_id}"] = {
        "version": 1,
        "key": f"{DOMAIN}.{mock_entry.entry_id}",
        "data": {
            "events": [],
            "sleep_start": None,
            "last_wake": "2026-01-01T06:00:00+00:00",
            "settings": {"merge_minutes": 30, "night_start": "20:30:00", "night_end": "07:00:00"},
        },
    }
    mock_entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(mock_entry.entry_id)
    await hass.async_block_till_done()
    assert hass.states.get("number.alex_same_feeding_window").state == "30"
    assert hass.states.get("time.alex_night_starts").state == "20:30:00"
    assert hass.states.get("time.alex_night_ends").state == "07:00:00"
    assert hass.states.get("sensor.alex_last_woke_up").state == "2026-01-01T06:00:00+00:00"


async def test_remove_deletes_storage(
    hass: HomeAssistant, entry: MockConfigEntry, hass_storage: dict[str, Any]
) -> None:
    await call(hass, "log_diaper", type="wet")
    await hass.config_entries.async_unload(entry.entry_id)
    assert f"{DOMAIN}.{entry.entry_id}" in hass_storage
    await hass.config_entries.async_remove(entry.entry_id)
    await hass.async_block_till_done()
    assert f"{DOMAIN}.{entry.entry_id}" not in hass_storage


async def test_card_is_served(hass: HomeAssistant, entry: MockConfigEntry, hass_client) -> None:
    urls = hass.data[DATA_EXTRA_MODULE_URL].urls
    url = next(u for u in urls if "baby-tracker-card.js" in u)
    assert url.startswith("/baby_tracker_static/baby-tracker-card.js?v=")
    client = await hass_client()
    response = await client.get(url.split("?")[0])
    assert response.status == 200
    assert 'customElements.define("baby-tracker-card"' in await response.text()
