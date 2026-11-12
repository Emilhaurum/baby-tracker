"""Fixtures for Baby Tracker tests."""

from __future__ import annotations

from collections.abc import Generator
from unittest.mock import patch

from homeassistant.core import HomeAssistant
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.baby_logger.const import DOMAIN


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations: None) -> Generator[None]:
    """Enable loading the custom integration in every test."""
    return


@pytest.fixture
def mock_entry() -> MockConfigEntry:
    """Return a config entry for a baby called Alex."""
    return MockConfigEntry(domain=DOMAIN, title="Alex", data={"name": "Alex"}, entry_id="alex_entry")


@pytest.fixture
async def entry(hass: HomeAssistant, mock_entry: MockConfigEntry) -> MockConfigEntry:
    """Set up the integration with one baby."""
    await hass.config.async_set_time_zone("Europe/Copenhagen")
    mock_entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(mock_entry.entry_id)
    await hass.async_block_till_done()
    return mock_entry


@pytest.fixture
def no_platforms() -> Generator[None]:
    """Skip entity platforms (for tests of the tracker only)."""
    with patch("custom_components.baby_logger.PLATFORMS", []):
        yield
