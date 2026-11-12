"""Helpers for Baby Tracker tests."""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant

from custom_components.baby_logger.const import DOMAIN

ENTRY_ID = "alex_entry"


async def call(hass: HomeAssistant, service: str, response: bool = False, **data: Any) -> Any:
    """Call a Baby Tracker action for the test baby."""
    result = await hass.services.async_call(
        DOMAIN,
        service,
        {"config_entry_id": ENTRY_ID, **data},
        blocking=True,
        return_response=response,
    )
    await hass.async_block_till_done()
    return result


def state(hass: HomeAssistant, entity_id: str) -> str:
    """Return an entity's state."""
    current = hass.states.get(entity_id)
    assert current is not None, f"{entity_id} does not exist"
    return current.state


def attrs(hass: HomeAssistant, entity_id: str) -> dict[str, Any]:
    """Return an entity's attributes."""
    current = hass.states.get(entity_id)
    assert current is not None, f"{entity_id} does not exist"
    return dict(current.attributes)
