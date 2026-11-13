"""Tests for buttons, switch, calendar, websocket, logbook and diagnostics."""

from __future__ import annotations

from datetime import timedelta

from freezegun.api import FrozenDateTimeFactory
from homeassistant.core import Event, HomeAssistant
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry
from pytest_homeassistant_custom_component.components.diagnostics import get_diagnostics_for_config_entry

from custom_components.baby_logger.const import DOMAIN, EVENT_BABY_TRACKER
from custom_components.baby_logger.logbook import async_describe_events, describe

from .helpers import call, state

BUTTONS = {
    "button.alex_diaper_wet": ("diaper", "wet"),
    "button.alex_diaper_dirty": ("diaper", "dirty"),
    "button.alex_diaper_wet_and_dirty": ("diaper", "both"),
    "button.alex_feed_left": ("feeding", "left"),
    "button.alex_feed_right": ("feeding", "right"),
    "button.alex_feed_bottle": ("feeding", "bottle"),
}


async def test_device_and_entities(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    devices = dr.async_entries_for_config_entry(dr.async_get(hass), entry.entry_id)
    assert len(devices) == 1
    device = devices[0]
    assert (DOMAIN, entry.entry_id) in device.identifiers
    assert device.name == "Alex"
    entities = er.async_entries_for_config_entry(er.async_get(hass), entry.entry_id)
    assert len(entities) == 14 + 7 + 1 + 1 + 1 + 2
    assert all(e.device_id == device.id for e in entities)


@pytest.mark.parametrize(("entity_id", "expected"), BUTTONS.items())
async def test_buttons(
    hass: HomeAssistant, entry: MockConfigEntry, entity_id: str, expected: tuple[str, str]
) -> None:
    await hass.services.async_call("button", "press", {"entity_id": entity_id}, blocking=True)
    event = entry.runtime_data.events[-1]
    assert event.kind == expected[0]
    assert (event.diaper_type or event.side) == expected[1]


async def test_undo_button(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    await call(hass, "log_diaper", type="wet")
    await hass.services.async_call(
        "button", "press", {"entity_id": "button.alex_undo_last_action"}, blocking=True
    )
    assert entry.runtime_data.events == []


async def test_switch(hass: HomeAssistant, entry: MockConfigEntry, freezer: FrozenDateTimeFactory) -> None:
    await hass.services.async_call("switch", "turn_on", {"entity_id": "switch.alex_sleeping"}, blocking=True)
    # Turning on again is a no-op instead of an error.
    await hass.services.async_call("switch", "turn_on", {"entity_id": "switch.alex_sleeping"}, blocking=True)
    assert state(hass, "switch.alex_sleeping") == "on"
    freezer.tick(timedelta(minutes=30))
    await hass.services.async_call("switch", "toggle", {"entity_id": "switch.alex_sleeping"}, blocking=True)
    await hass.services.async_call("switch", "turn_off", {"entity_id": "switch.alex_sleeping"}, blocking=True)
    assert state(hass, "switch.alex_sleeping") == "off"
    assert len(entry.runtime_data.events) == 1


async def test_calendar(hass: HomeAssistant, entry: MockConfigEntry, hass_ws_client) -> None:
    tracker = entry.runtime_data
    day = (dt_util.now() - timedelta(days=1)).replace(hour=12, minute=0, second=0, microsecond=0)
    client = await hass_ws_client(hass)

    async def send(msg: dict) -> dict:
        await client.send_json_auto_id(msg)
        return await client.receive_json()

    result = await send(
        {
            "type": "calendar/event/create",
            "entity_id": "calendar.alex_sleep",
            "event": {
                "summary": "x",
                "dtstart": day.isoformat(),
                "dtend": (day + timedelta(hours=1)).isoformat(),
            },
        }
    )
    assert result["success"]
    assert len(tracker.events) == 1
    uid = tracker.events[0].id

    response = await hass.services.async_call(
        "calendar",
        "get_events",
        {
            "entity_id": "calendar.alex_sleep",
            "start_date_time": day.replace(hour=0).isoformat(),
            "duration": {"hours": 24},
        },
        blocking=True,
        return_response=True,
    )
    events = response["calendar.alex_sleep"]["events"]
    assert len(events) == 1

    result = await send(
        {
            "type": "calendar/event/update",
            "entity_id": "calendar.alex_sleep",
            "uid": uid,
            "event": {
                "summary": "x",
                "dtstart": day.isoformat(),
                "dtend": (day + timedelta(hours=2)).isoformat(),
            },
        }
    )
    assert result["success"]
    assert tracker.events[0].end - tracker.events[0].start == timedelta(hours=2)
    # Moving a sleep can be undone too.
    await call(hass, "undo")
    assert tracker.events[0].end - tracker.events[0].start == timedelta(hours=1)

    result = await send(
        {
            "type": "calendar/event/create",
            "entity_id": "calendar.alex_sleep",
            "event": {
                "summary": "x",
                "dtstart": day.date().isoformat(),
                "dtend": (day.date() + timedelta(days=1)).isoformat(),
            },
        }
    )
    assert not result["success"]

    result = await send({"type": "calendar/event/delete", "entity_id": "calendar.alex_sleep", "uid": uid})
    assert result["success"]
    assert tracker.events == []


async def test_calendar_state_while_sleeping(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    assert state(hass, "calendar.alex_sleep") == "off"
    await call(hass, "start_sleep")
    assert state(hass, "calendar.alex_sleep") == "on"


async def test_websocket(hass: HomeAssistant, entry: MockConfigEntry, hass_ws_client) -> None:
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "baby_logger/babies"})
    msg = await client.receive_json()
    assert msg["result"] == [{"entry_id": entry.entry_id, "name": "Alex"}]

    await client.send_json_auto_id({"type": "baby_logger/subscribe", "entry_id": entry.entry_id, "days": 3})
    assert (await client.receive_json())["success"]
    snapshot = (await client.receive_json())["event"]
    assert snapshot["name"] == "Alex"
    assert snapshot["events"] == []
    assert snapshot["next_side"] == "left"

    await call(hass, "log_diaper", type="dirty")
    snapshot = (await client.receive_json())["event"]
    assert snapshot["today"]["diapers"] == {"total": 1, "wet": 0, "dirty": 1, "both": 0}
    assert snapshot["undo"]["action"] == "diaper"
    assert snapshot["last_diaper"]["diaper_type"] == "dirty"
    assert len(snapshot["events"]) == 1

    await client.send_json_auto_id({"type": "baby_logger/subscribe", "entry_id": "missing"})
    msg = await client.receive_json()
    assert not msg["success"]
    assert msg["error"]["code"] == "not_found"


async def test_logbook_descriptions() -> None:
    at = "2026-05-05T10:00:00+00:00"
    assert "wet diaper" in describe({"action": "diaper", "type": "wet", "time": at})
    assert "started a feeding: left, 60 ml" in describe(
        {"action": "feeding", "side": "left", "amount_ml": 60.0, "same_feeding": False, "time": at}
    )
    assert "switched to right" in describe(
        {"action": "feeding", "side": "right", "same_feeding": True, "time": at}
    )
    assert "fell asleep" in describe({"action": "sleep", "time": at})
    assert "1h 05m" in describe({"action": "wake", "minutes": 65, "time": at})
    assert "undid" in describe({"action": "undo", "undone": "diaper"})
    assert "deleted a sleep" in describe({"action": "delete", "kind": "sleep"})
    assert "sleep added" in describe({"action": "add_sleep", "start": at, "end": at})
    assert describe({"action": "update_sleep"}) == "😴 sleep changed"


async def test_logbook_platform(hass: HomeAssistant) -> None:
    described = {}
    async_describe_events(hass, lambda domain, event_type, fn: described.update({(domain, event_type): fn}))
    fn = described[(DOMAIN, EVENT_BABY_TRACKER)]
    result = fn(
        Event(EVENT_BABY_TRACKER, {"name": "Alex", "action": "sleep", "time": "2026-05-05T10:00:00+00:00"})
    )
    assert result["name"] == "Alex"
    assert "fell asleep" in result["message"]


async def test_diagnostics(hass: HomeAssistant, entry: MockConfigEntry, hass_client) -> None:
    await call(hass, "log_diaper", type="wet")
    result = await get_diagnostics_for_config_entry(hass, hass_client, entry)
    assert result["tracker"]["event_counts"] == {"diaper": 1, "feeding": 0, "sleep": 0}
    assert "Alex" not in str(result)


async def test_errors_raise_for_switch_edge_cases(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    with pytest.raises(ServiceValidationError):
        entry.runtime_data.async_end_sleep()


async def test_websocket_sleeps(hass: HomeAssistant, entry: MockConfigEntry, hass_ws_client) -> None:
    now = dt_util.now()
    day = now - timedelta(days=2)
    await call(
        hass,
        "add_sleep",
        start=(day - timedelta(hours=3)).isoformat(),
        end=(day - timedelta(hours=1)).isoformat(),
    )
    # Overlapping sleeps are merged.
    await call(hass, "add_sleep", start=(day - timedelta(hours=2)).isoformat(), end=day.isoformat())
    # Outside the requested range.
    await call(
        hass,
        "add_sleep",
        start=(now - timedelta(days=30)).isoformat(),
        end=(now - timedelta(days=29)).isoformat(),
    )
    await call(hass, "log_diaper", type="wet")
    await call(hass, "start_sleep")

    client = await hass_ws_client(hass)
    await client.send_json_auto_id(
        {
            "type": "baby_logger/sleeps",
            "entry_id": entry.entry_id,
            "start": (now - timedelta(days=7)).isoformat(),
        }
    )
    msg = await client.receive_json()
    assert msg["success"]
    assert msg["result"]["revision"] == entry.runtime_data.revision
    sleeps = msg["result"]["sleeps"]
    assert len(sleeps) == 1
    start, end = (dt_util.parse_datetime(v) for v in sleeps[0])
    assert end - start == timedelta(hours=3)

    await client.send_json_auto_id(
        {"type": "baby_logger/sleeps", "entry_id": "missing", "start": now.isoformat()}
    )
    msg = await client.receive_json()
    assert msg["error"]["code"] == "not_found"

    await client.send_json_auto_id(
        {"type": "baby_logger/sleeps", "entry_id": entry.entry_id, "start": "nope"}
    )
    msg = await client.receive_json()
    assert not msg["success"]
