"""Tests for the actions and the resulting sensor states."""

from __future__ import annotations

from datetime import datetime, timedelta

from freezegun.api import FrozenDateTimeFactory
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ServiceValidationError
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_capture_events,
    async_fire_time_changed,
)

from custom_components.baby_tracker.const import EVENT_BABY_TRACKER

from .helpers import attrs, call, state


async def test_log_diaper(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    events = async_capture_events(hass, EVENT_BABY_TRACKER)
    result = await call(hass, "log_diaper", response=True, type="wet")
    assert result["event"]["diaper_type"] == "wet"
    await call(hass, "log_diaper", type="both")

    assert state(hass, "sensor.alex_diapers_today") == "2"
    assert {k: attrs(hass, "sensor.alex_diapers_today")[k] for k in ("wet", "dirty", "both")} == {
        "wet": 1,
        "dirty": 0,
        "both": 1,
    }
    assert state(hass, "sensor.alex_last_diaper_type") == "both"
    assert attrs(hass, "sensor.alex_last_diaper")["type"] == "both"
    assert [e.data["action"] for e in events] == ["diaper", "diaper"]
    assert events[0].data["config_entry_id"] == entry.entry_id


async def test_backdated_diaper(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    earlier = dt_util.now() - timedelta(hours=2)
    await call(hass, "log_diaper", type="dirty")
    await call(hass, "log_diaper", type="wet", time=earlier.isoformat())
    # The newest by time stays the last diaper.
    assert state(hass, "sensor.alex_last_diaper_type") == "dirty"


async def test_naive_time_is_local(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    await call(hass, "log_diaper", type="wet", time="2026-01-05 10:00:00")
    event = entry.runtime_data.events[0]
    assert dt_util.as_local(event.start).hour == 10


async def test_feeding_merge_window(
    hass: HomeAssistant, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to("2026-05-04 10:00:00+02:00")
    result = await call(hass, "log_feeding", response=True, side="left")
    assert result["same_feeding"] is False

    freezer.tick(timedelta(minutes=20))
    result = await call(hass, "log_feeding", response=True, side="right")
    assert result["same_feeding"] is True
    assert [s["side"] for s in result["event"]["sides"]] == ["left", "right"]

    assert state(hass, "sensor.alex_feedings_today") == "1"
    assert state(hass, "sensor.alex_last_feeding_side") == "right"
    assert state(hass, "sensor.alex_next_feeding_side") == "left"
    assert attrs(hass, "sensor.alex_last_feeding")["sides"] == ["left", "right"]

    # The window counts from the latest side switch.
    freezer.tick(timedelta(minutes=44))
    result = await call(hass, "log_feeding", response=True, side="left")
    assert result["same_feeding"] is True

    freezer.tick(timedelta(minutes=46))
    result = await call(hass, "log_feeding", response=True, side="right")
    assert result["same_feeding"] is False
    assert state(hass, "sensor.alex_feedings_today") == "2"
    assert attrs(hass, "sensor.alex_feedings_today")["right"] == 1


async def test_merge_window_setting(
    hass: HomeAssistant, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    await hass.services.async_call(
        "number", "set_value", {"entity_id": "number.alex_same_feeding_window", "value": 0}, blocking=True
    )
    assert state(hass, "number.alex_same_feeding_window") == "0"
    await call(hass, "log_feeding", side="left")
    freezer.tick(timedelta(minutes=1))
    result = await call(hass, "log_feeding", response=True, side="right")
    assert result["same_feeding"] is False


async def test_bottle_amounts(
    hass: HomeAssistant, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to("2026-05-04 10:00:00+02:00")
    await call(hass, "log_feeding", side="bottle", amount_ml=90)
    freezer.tick(timedelta(minutes=10))
    await call(hass, "log_feeding", side="bottle", amount_ml=30)
    assert state(hass, "sensor.alex_bottle_today") == "120.0"
    assert attrs(hass, "sensor.alex_last_feeding")["amount_ml"] == 120
    # A bottle doesn't change which breast is next.
    assert state(hass, "sensor.alex_next_feeding_side") == "left"


async def test_next_side_skips_bottle(
    hass: HomeAssistant, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    await call(hass, "log_feeding", side="left")
    freezer.tick(timedelta(minutes=5))
    await call(hass, "log_feeding", side="bottle")
    assert state(hass, "sensor.alex_next_feeding_side") == "right"


async def test_today_resets_at_midnight(
    hass: HomeAssistant, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to("2026-05-04 23:50:00+02:00")
    await call(hass, "log_diaper", type="wet")
    await call(hass, "log_feeding", side="left", amount_ml=50)
    assert state(hass, "sensor.alex_diapers_today") == "1"

    freezer.move_to("2026-05-05 00:01:00+02:00")
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert state(hass, "sensor.alex_diapers_today") == "0"
    assert state(hass, "sensor.alex_feedings_today") == "0"
    assert state(hass, "sensor.alex_bottle_today") == "0"
    assert state(hass, "sensor.alex_last_diaper_type") == "wet"


async def test_sleep_cycle(
    hass: HomeAssistant, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to("2026-05-04 12:00:00+02:00")
    await call(hass, "start_sleep")
    assert state(hass, "switch.alex_sleeping") == "on"
    assert attrs(hass, "switch.alex_sleeping")["since"] == "2026-05-04T10:00:00+00:00"

    freezer.tick(timedelta(minutes=90))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert state(hass, "sensor.alex_sleep_today") == "1.5"

    with pytest.raises(ServiceValidationError):
        await call(hass, "start_sleep")

    result = await call(hass, "end_sleep", response=True)
    assert result["event"]["kind"] == "sleep"
    assert state(hass, "switch.alex_sleeping") == "off"
    assert state(hass, "sensor.alex_sleep_today") == "1.5"
    assert state(hass, "sensor.alex_last_woke_up") == "2026-05-04T11:30:00+00:00"
    assert attrs(hass, "switch.alex_sleeping")["since"] == "2026-05-04T11:30:00+00:00"

    with pytest.raises(ServiceValidationError):
        await call(hass, "end_sleep")


async def test_accidental_sleep_not_stored(
    hass: HomeAssistant, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    await call(hass, "start_sleep")
    freezer.tick(timedelta(seconds=20))
    result = await call(hass, "end_sleep", response=True)
    assert result["event"] is None
    assert entry.runtime_data.events == []


async def test_end_sleep_before_start(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    await call(hass, "start_sleep")
    with pytest.raises(ServiceValidationError):
        await call(hass, "end_sleep", time=(dt_util.now() - timedelta(hours=1)).isoformat())


async def test_add_sleep_and_stats(
    hass: HomeAssistant, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to("2026-05-05 15:00:00+02:00")
    tz = dt_util.get_default_time_zone()
    await call(
        hass,
        "add_sleep",
        start=datetime(2026, 5, 4, 21, 0, tzinfo=tz).isoformat(),
        end=datetime(2026, 5, 5, 2, 0, tzinfo=tz).isoformat(),
    )
    await call(
        hass,
        "add_sleep",
        start=datetime(2026, 5, 5, 2, 30, tzinfo=tz).isoformat(),
        end=datetime(2026, 5, 5, 7, 30, tzinfo=tz).isoformat(),
    )
    await call(
        hass,
        "add_sleep",
        start=datetime(2026, 5, 5, 12, 0, tzinfo=tz).isoformat(),
        end=datetime(2026, 5, 5, 13, 30, tzinfo=tz).isoformat(),
    )

    # Since midnight: 2h + 5h + 1.5h.
    assert state(hass, "sensor.alex_sleep_today") == "8.5"
    # Night 22:00-09:00: 4h + 5h asleep, 1 wake-up.
    assert state(hass, "sensor.alex_last_night_sleep") == "9.0"
    night = attrs(hass, "sensor.alex_last_night_sleep")
    assert night["wakes"] == 1
    assert night["awake"] == 2.0
    assert night["avg_asleep"] == 9.0
    # Daytime since 09:00: one 1.5h nap.
    assert state(hass, "sensor.alex_daytime_sleep") == "1.5"
    assert attrs(hass, "sensor.alex_daytime_sleep")["naps"] == 1

    with pytest.raises(ServiceValidationError):
        await call(hass, "add_sleep", start="2026-05-05 10:00:00", end="2026-05-05 09:00:00")


async def test_night_window_setting(
    hass: HomeAssistant, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to("2026-05-05 15:00:00+02:00")
    await hass.services.async_call(
        "time", "set_value", {"entity_id": "time.alex_night_starts", "time": "19:00:00"}, blocking=True
    )
    await hass.services.async_call(
        "time", "set_value", {"entity_id": "time.alex_night_ends", "time": "07:00:00"}, blocking=True
    )
    assert state(hass, "time.alex_night_starts") == "19:00:00"
    assert attrs(hass, "sensor.alex_last_night_sleep")["from"].startswith("2026-05-04T19:00:00")


async def test_undo(hass: HomeAssistant, entry: MockConfigEntry, freezer: FrozenDateTimeFactory) -> None:
    tracker = entry.runtime_data
    assert state(hass, "button.alex_undo_last_action") == "unavailable"
    with pytest.raises(ServiceValidationError):
        await call(hass, "undo")

    await call(hass, "log_diaper", type="wet")
    assert state(hass, "button.alex_undo_last_action") != "unavailable"
    await call(hass, "undo")
    assert tracker.events == []
    assert state(hass, "sensor.alex_diapers_today") == "0"

    # Undo a side switch keeps the original feeding.
    await call(hass, "log_feeding", side="left")
    freezer.tick(timedelta(minutes=5))
    await call(hass, "log_feeding", side="right")
    await call(hass, "undo")
    assert [s["side"] for s in tracker.events[0].sides] == ["left"]

    # Undo a new feeding removes it.
    freezer.tick(timedelta(hours=2))
    await call(hass, "log_feeding", side="right")
    await call(hass, "undo")
    assert len(tracker.events) == 1

    # Undo falling asleep.
    await call(hass, "start_sleep")
    await call(hass, "undo")
    assert state(hass, "switch.alex_sleeping") == "off"

    # Undo waking up continues the sleep.
    await call(hass, "start_sleep")
    started = tracker.sleep_start
    freezer.tick(timedelta(hours=1))
    await call(hass, "end_sleep")
    assert any(e.kind == "sleep" for e in tracker.events)
    await call(hass, "undo")
    assert tracker.sleep_start == started
    assert not any(e.kind == "sleep" for e in tracker.events)
    assert state(hass, "switch.alex_sleeping") == "on"


async def test_undo_expires(
    hass: HomeAssistant, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    await call(hass, "log_diaper", type="wet")
    freezer.tick(timedelta(seconds=31))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()
    assert state(hass, "button.alex_undo_last_action") == "unavailable"
    with pytest.raises(ServiceValidationError):
        await call(hass, "undo")


async def test_delete_and_undo_delete(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    result = await call(hass, "log_diaper", response=True, type="dirty")
    event_id = result["event"]["id"]
    await call(hass, "delete_event", event_id=event_id)
    assert state(hass, "sensor.alex_diapers_today") == "0"
    await call(hass, "undo")
    assert state(hass, "sensor.alex_diapers_today") == "1"

    with pytest.raises(ServiceValidationError):
        await call(hass, "delete_event", event_id="nope")


async def test_unknown_entry(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(
            "baby_tracker", "log_diaper", {"config_entry_id": "missing", "type": "wet"}, blocking=True
        )
    await hass.config_entries.async_unload(entry.entry_id)
    with pytest.raises(ServiceValidationError):
        await call(hass, "log_diaper", type="wet")


async def test_tracker_validates_values(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    tracker = entry.runtime_data
    with pytest.raises(ServiceValidationError):
        tracker.async_log_diaper("green")
    with pytest.raises(ServiceValidationError):
        tracker.async_log_feeding("middle")
