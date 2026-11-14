"""Tests for the config flow."""

from __future__ import annotations

from homeassistant.config_entries import SOURCE_USER
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.baby_logger.const import DOMAIN


async def test_user_flow(hass: HomeAssistant) -> None:
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "user"

    result = await hass.config_entries.flow.async_configure(result["flow_id"], {"name": "  Alex "})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "Alex"
    assert result["data"] == {"name": "Alex"}
    await hass.async_block_till_done()
    assert hass.states.get("sensor.alex_last_diaper") is not None


async def test_empty_name(hass: HomeAssistant) -> None:
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {"name": "   "})
    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {"name": "name_required"}


async def test_duplicate_name(hass: HomeAssistant, mock_entry: MockConfigEntry) -> None:
    mock_entry.add_to_hass(hass)
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {"name": "alex"})
    # The form is shown again so the name can be corrected.
    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {"name": "name_taken"}
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {"name": "Alexa"})
    assert result["type"] is FlowResultType.CREATE_ENTRY


async def test_two_babies(hass: HomeAssistant) -> None:
    for name in ("Alex", "Sam"):
        result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
        result = await hass.config_entries.flow.async_configure(result["flow_id"], {"name": name})
        assert result["type"] is FlowResultType.CREATE_ENTRY
    await hass.async_block_till_done()
    assert hass.states.get("switch.alex_sleeping") is not None
    assert hass.states.get("switch.sam_sleeping") is not None


async def test_reconfigure(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    result = await entry.start_reconfigure_flow(hass)
    assert result["type"] is FlowResultType.FORM
    assert result["step_id"] == "reconfigure"

    result = await hass.config_entries.flow.async_configure(result["flow_id"], {"name": " "})
    assert result["errors"] == {"name": "name_required"}

    result = await hass.config_entries.flow.async_configure(result["flow_id"], {"name": "Alexander"})
    assert result["type"] is FlowResultType.ABORT
    assert result["reason"] == "reconfigure_successful"
    await hass.async_block_till_done()
    assert entry.title == "Alexander"
    assert entry.runtime_data.name == "Alexander"
