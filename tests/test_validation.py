"""Tests for input validation: future times, duplicate names, backdated sides."""

from __future__ import annotations

from freezegun.api import FrozenDateTimeFactory
from homeassistant.config_entries import SOURCE_RECONFIGURE
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.exceptions import ServiceValidationError
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.baby_logger.const import DOMAIN

from .helpers import call, state

NOW = "2026-05-05 15:00:00+02:00"
LATER = "2026-05-06T11:00:00+02:00"


@pytest.mark.parametrize(
    ("action", "data"),
    [
        ("log_diaper", {"type": "wet", "time": LATER}),
        ("log_feeding", {"side": "left", "time": LATER}),
        ("start_sleep", {"time": LATER}),
        ("add_sleep", {"start": "2026-05-05T14:00:00+02:00", "end": LATER}),
        ("add_sleep", {"start": LATER, "end": "2026-05-06T12:00:00+02:00"}),
    ],
)
async def test_times_in_the_future_are_rejected(
    hass: HomeAssistant, entry: MockConfigEntry, freezer: FrozenDateTimeFactory, action: str, data: dict
) -> None:
    freezer.move_to(NOW)
    with pytest.raises(ServiceValidationError) as err:
        await call(hass, action, **data)
    assert err.value.translation_key == "time_in_future"
    assert entry.runtime_data.events == []
    assert state(hass, "switch.alex_sleeping") == "off"


async def test_end_sleep_in_the_future_is_rejected(
    hass: HomeAssistant, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to(NOW)
    await call(hass, "start_sleep", time="2026-05-05T13:00:00+02:00")
    with pytest.raises(ServiceValidationError) as err:
        await call(hass, "end_sleep", time=LATER)
    assert err.value.translation_key == "time_in_future"
    assert state(hass, "switch.alex_sleeping") == "on"


async def test_moving_a_sleep_into_the_future_is_rejected(
    hass: HomeAssistant, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to(NOW)
    result = await call(
        hass, "add_sleep", response=True, start="2026-05-05T12:00:00+02:00", end="2026-05-05T13:00:00+02:00"
    )
    tracker = entry.runtime_data
    event_id = result["event"]["id"]
    with pytest.raises(ServiceValidationError) as err:
        tracker.async_update_sleep(
            event_id,
            tracker.get_event(event_id).start,
            tracker.get_event(event_id).end.replace(day=6),
        )
    assert err.value.translation_key == "time_in_future"


async def test_a_little_clock_skew_is_allowed(
    hass: HomeAssistant, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to(NOW)
    await call(hass, "log_diaper", type="wet", time="2026-05-05T15:00:30+02:00")
    assert state(hass, "sensor.alex_diapers_today") == "1"


async def test_side_backdated_just_before_a_feeding_merges(
    hass: HomeAssistant, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to("2026-05-05 10:20:00+02:00")
    await call(hass, "log_feeding", side="right")
    result = await call(hass, "log_feeding", response=True, side="left", time="2026-05-05T10:10:00+02:00")
    assert result["same_feeding"] is True
    assert [s["side"] for s in result["event"]["sides"]] == ["left", "right"]
    assert result["event"]["start"].startswith("2026-05-05T08:10:00")
    assert state(hass, "sensor.alex_feedings_today") == "1"
    assert state(hass, "sensor.alex_last_feeding_side") == "right"

    # Undo puts the feeding back as it was.
    await call(hass, "undo")
    (feeding,) = entry.runtime_data.events
    assert [s["side"] for s in feeding.sides] == ["right"]
    assert feeding.start.isoformat().startswith("2026-05-05T08:20:00")


async def test_side_backdated_long_before_a_feeding_is_its_own(
    hass: HomeAssistant, entry: MockConfigEntry, freezer: FrozenDateTimeFactory
) -> None:
    freezer.move_to("2026-05-05 10:20:00+02:00")
    await call(hass, "log_feeding", side="right")
    result = await call(hass, "log_feeding", response=True, side="left", time="2026-05-05T09:00:00+02:00")
    assert result["same_feeding"] is False
    assert state(hass, "sensor.alex_feedings_today") == "2"


async def _add(hass: HomeAssistant, name: str) -> MockConfigEntry:
    entry = MockConfigEntry(domain=DOMAIN, title=name, data={"name": name})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def test_reconfigure_rejects_another_babys_name(hass: HomeAssistant) -> None:
    await _add(hass, "Alex")
    sam = await _add(hass, "Sam")
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_RECONFIGURE, "entry_id": sam.entry_id}
    )
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {"name": "alex"})
    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {"name": "name_taken"}
    # The form can be corrected; changing the casing of its own name is fine.
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {"name": "SAM"})
    assert result["reason"] == "reconfigure_successful"
    assert sam.title == "SAM"
