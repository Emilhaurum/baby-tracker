"""Regression tests for issues found in code review."""

from __future__ import annotations

from datetime import datetime, timedelta

from freezegun.api import FrozenDateTimeFactory
from homeassistant.components.sensor import ATTR_LAST_RESET, ATTR_STATE_CLASS, SensorStateClass
from homeassistant.config_entries import SOURCE_RECONFIGURE
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ServiceValidationError
from homeassistant.util import dt as dt_util
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.baby_logger.const import DOMAIN

from .helpers import attrs, call, state


async def test_subscription_survives_reload(
    hass: HomeAssistant, entry: MockConfigEntry, hass_ws_client
) -> None:
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "baby_logger/subscribe", "entry_id": entry.entry_id})
    assert (await client.receive_json())["success"]
    await client.receive_json()  # initial snapshot

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_RECONFIGURE, "entry_id": entry.entry_id}
    )
    await hass.config_entries.flow.async_configure(result["flow_id"], {"name": "Alexander"})
    await hass.async_block_till_done()

    # After the reload the open subscription gets the new tracker's data.
    msg = await client.receive_json()
    while msg["event"]["name"] != "Alexander":
        msg = await client.receive_json()
    await call(hass, "log_diaper", type="wet")
    msg = await client.receive_json()
    assert msg["event"]["today"]["diapers"]["wet"] == 1


async def test_overlapping_sleeps_not_double_counted(
    hass: HomeAssistant, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to("2026-05-05 15:00:00+02:00")
    tz = dt_util.get_default_time_zone()
    await call(
        hass,
        "add_sleep",
        start=datetime(2026, 5, 5, 1, tzinfo=tz).isoformat(),
        end=datetime(2026, 5, 5, 5, tzinfo=tz).isoformat(),
    )
    await call(
        hass,
        "add_sleep",
        start=datetime(2026, 5, 5, 2, tzinfo=tz).isoformat(),
        end=datetime(2026, 5, 5, 6, tzinfo=tz).isoformat(),
    )
    assert state(hass, "sensor.alex_sleep_today") == "5.0"
    night = attrs(hass, "sensor.alex_last_night_sleep")
    assert state(hass, "sensor.alex_last_night_sleep") == "5.0"
    assert night["awake"] >= 0
    assert night["wakes"] == 0


async def test_next_side_after_bottle_only_feeding(
    hass: HomeAssistant, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    await call(hass, "log_feeding", side="left")
    freezer.tick(timedelta(hours=3))
    await call(hass, "log_feeding", side="bottle", amount_ml=90)
    assert state(hass, "sensor.alex_next_feeding_side") == "right"


async def test_bottle_today_is_total_with_daily_reset(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    await call(hass, "log_feeding", side="bottle", amount_ml=120)
    await call(hass, "undo")
    await call(hass, "log_feeding", side="bottle", amount_ml=100)
    current = attrs(hass, "sensor.alex_bottle_today")
    assert current[ATTR_STATE_CLASS] == SensorStateClass.TOTAL
    assert current[ATTR_LAST_RESET] == dt_util.start_of_local_day().isoformat()
    assert state(hass, "sensor.alex_bottle_today") == "100.0"


async def test_night_start_cannot_equal_end(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(
            "time", "set_value", {"entity_id": "time.alex_night_starts", "time": "09:00:00"}, blocking=True
        )
    assert state(hass, "time.alex_night_starts") == "22:00:00"


async def test_backdated_switch_inside_feeding_merges(
    hass: HomeAssistant, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to("2026-05-05 10:00:00+02:00")
    await call(hass, "log_feeding", side="left")
    freezer.move_to("2026-05-05 10:20:00+02:00")
    await call(hass, "log_feeding", side="right")
    result = await call(hass, "log_feeding", response=True, side="left", time="2026-05-05T10:10:00+02:00")
    assert result["same_feeding"] is True
    assert [s["side"] for s in result["event"]["sides"]] == ["left", "left", "right"]
    assert state(hass, "sensor.alex_feedings_today") == "1"
    # The latest side is still the one logged last in time.
    assert state(hass, "sensor.alex_last_feeding_side") == "right"


async def test_calendar_cannot_touch_other_entries(
    hass: HomeAssistant, entry: MockConfigEntry, hass_ws_client
) -> None:
    result = await call(hass, "log_diaper", response=True, type="wet")
    diaper_id = result["event"]["id"]
    client = await hass_ws_client(hass)
    now = dt_util.now()
    await client.send_json_auto_id(
        {
            "type": "calendar/event/update",
            "entity_id": "calendar.alex_sleep",
            "uid": diaper_id,
            "event": {
                "summary": "x",
                "dtstart": (now - timedelta(hours=2)).isoformat(),
                "dtend": (now - timedelta(hours=1)).isoformat(),
            },
        }
    )
    assert not (await client.receive_json())["success"]
    await client.send_json_auto_id(
        {"type": "calendar/event/delete", "entity_id": "calendar.alex_sleep", "uid": diaper_id}
    )
    assert not (await client.receive_json())["success"]
    assert entry.runtime_data.events[0].kind == "diaper"
    assert entry.runtime_data.events[0].end is None
