"""Websocket API used by the bundled dashboard card."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.util import dt as dt_util
import voluptuous as vol

from .const import DOMAIN, KIND_SLEEP
from .services import get_tracker
from .stats import merge_intervals
from .tracker import signal_update

# Upper limit for the sleep timeline (days per line x lines).
MAX_SLEEP_RANGE_DAYS = 3 * 366


@callback
def async_setup_websocket(hass: HomeAssistant) -> None:
    """Register websocket commands."""
    websocket_api.async_register_command(hass, ws_babies)
    websocket_api.async_register_command(hass, ws_subscribe)
    websocket_api.async_register_command(hass, ws_sleeps)


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
    entry_id: str = msg["entry_id"]
    try:
        get_tracker(hass, entry_id)
    except ServiceValidationError as err:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, str(err))
        return
    days: int = msg["days"]

    @callback
    def forward() -> None:
        # Look the tracker up each time: the entry may have been reloaded. It is
        # read directly because the first update after a reload is sent while
        # the entry is still finishing its setup.
        entry = hass.config_entries.async_get_entry(entry_id)
        tracker = getattr(entry, "runtime_data", None) if entry else None
        if tracker is None:
            return
        connection.send_message(websocket_api.event_message(msg["id"], tracker.snapshot(days)))

    connection.subscriptions[msg["id"]] = async_dispatcher_connect(hass, signal_update(entry_id), forward)
    connection.send_result(msg["id"])
    forward()


def _parse_time(value: str) -> Any:
    parsed = dt_util.parse_datetime(value)
    if parsed is None:
        raise vol.Invalid(f"Invalid datetime: {value}")
    return dt_util.as_utc(parsed)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/sleeps",
        vol.Required("entry_id"): str,
        vol.Required("start"): _parse_time,
        vol.Optional("end"): _parse_time,
    }
)
@callback
def ws_sleeps(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Return finished sleeps in a range as [start, end] pairs (overlaps merged).

    The ongoing sleep is not included; it is in the subscription's snapshot.
    """
    try:
        tracker = get_tracker(hass, msg["entry_id"])
    except ServiceValidationError as err:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, str(err))
        return
    end = msg.get("end") or dt_util.utcnow()
    start = max(msg["start"], end - timedelta(days=MAX_SLEEP_RANGE_DAYS))
    sleeps = merge_intervals(
        (e.start, e.end)
        for e in tracker.events_between(start, end)
        if e.kind == KIND_SLEEP and e.end is not None
    )
    connection.send_result(
        msg["id"],
        {
            "revision": tracker.revision,
            "sleeps": [[s.isoformat(), e.isoformat()] for s, e in sleeps],
        },
    )
