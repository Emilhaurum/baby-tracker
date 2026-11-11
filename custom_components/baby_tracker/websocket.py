"""Websocket API used by the bundled dashboard card."""

from __future__ import annotations

from typing import Any

from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import ServiceValidationError
import voluptuous as vol

from .const import DOMAIN
from .services import get_tracker


@callback
def async_setup_websocket(hass: HomeAssistant) -> None:
    """Register websocket commands."""
    websocket_api.async_register_command(hass, ws_babies)
    websocket_api.async_register_command(hass, ws_subscribe)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/babies"})
@callback
def ws_babies(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """List the tracked babies."""
    connection.send_result(
        msg["id"],
        [
            {"entry_id": entry.entry_id, "name": entry.title}
            for entry in hass.config_entries.async_entries(DOMAIN)
            if entry.state is ConfigEntryState.LOADED
        ],
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/subscribe",
        vol.Required("entry_id"): str,
        vol.Optional("days", default=7): vol.All(int, vol.Range(min=1, max=31)),
    }
)
@callback
def ws_subscribe(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Send the baby's state now and whenever it changes."""
    try:
        tracker = get_tracker(hass, msg["entry_id"])
    except ServiceValidationError as err:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, str(err))
        return
    days: int = msg["days"]

    @callback
    def forward() -> None:
        connection.send_message(websocket_api.event_message(msg["id"], tracker.snapshot(days)))

    connection.subscriptions[msg["id"]] = tracker.async_add_listener(forward)
    connection.send_result(msg["id"])
    forward()
