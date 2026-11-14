"""Tests for growth measurements, milestones and the birth date."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from homeassistant.config_entries import SOURCE_RECONFIGURE, SOURCE_USER
from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType
from homeassistant.exceptions import ServiceValidationError
from homeassistant.util import dt as dt_util
from homeassistant.util.unit_system import US_CUSTOMARY_SYSTEM
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.baby_logger.const import DOMAIN
from custom_components.baby_logger.milestones import MILESTONES

from .helpers import attrs, call, state


async def test_log_growth_metric(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    result = await call(hass, "log_growth", response=True, weight=4.2, length=55, date="2026-03-01")
    assert result["measurement"]["weight_kg"] == 4.2
    assert result["measurement"]["length_cm"] == 55
    assert result["measurement"]["date"] == "2026-03-01"
    assert state(hass, "sensor.alex_weight") == "4.2"
    assert attrs(hass, "sensor.alex_weight")["measured"] == "2026-03-01"
    assert state(hass, "sensor.alex_length") == "55.0"


async def test_log_growth_imperial(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    result = await call(hass, "log_growth", response=True, weight=10, length=24, units="imperial")
    assert result["measurement"]["weight_kg"] == pytest.approx(4.536, abs=0.001)
    assert result["measurement"]["length_cm"] == pytest.approx(61.0, abs=0.05)
    assert result["measurement"]["date"] == dt_util.now().date().isoformat()


async def test_latest_value_per_kind(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    await call(hass, "log_growth", weight=5.0, length=60, date="2026-04-01")
    # A later weight-only measurement keeps the older length.
    await call(hass, "log_growth", weight=6.1, date="2026-05-01")
    # Logged after the fact for an earlier date: not the latest.
    await call(hass, "log_growth", weight=4.0, date="2026-03-01")
    assert state(hass, "sensor.alex_weight") == "6.1"
    assert state(hass, "sensor.alex_length") == "60.0"
    assert attrs(hass, "sensor.alex_length")["measured"] == "2026-04-01"
    assert [g["date"].isoformat() for g in entry.runtime_data.growth] == [
        "2026-03-01",
        "2026-04-01",
        "2026-05-01",
    ]


async def test_growth_validation(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    with pytest.raises(ServiceValidationError, match="weight, a length"):
        await call(hass, "log_growth", date="2026-03-01")
    with pytest.raises(ServiceValidationError):
        await call(hass, "log_growth", weight=500)
    with pytest.raises(ServiceValidationError):
        await call(hass, "log_growth", length=5)


async def test_delete_growth_and_undo(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    result = await call(hass, "log_growth", response=True, weight=4.2)
    measurement_id = result["measurement"]["id"]
    await call(hass, "delete_growth", event_id=measurement_id)
    assert state(hass, "sensor.alex_weight") == "unknown"
    await call(hass, "undo")
    assert state(hass, "sensor.alex_weight") == "4.2"
    with pytest.raises(ServiceValidationError):
        await call(hass, "delete_growth", event_id="nope")


async def test_undo_growth(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    await call(hass, "log_growth", weight=4.2)
    await call(hass, "undo")
    assert entry.runtime_data.growth == []


async def test_sensors_follow_unit_system(hass: HomeAssistant, mock_entry: MockConfigEntry) -> None:
    # The display unit is chosen when the sensor is first registered.
    hass.config.units = US_CUSTOMARY_SYSTEM
    mock_entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(mock_entry.entry_id)
    await hass.async_block_till_done()
    await call(hass, "log_growth", weight=4.5359237, length=60.96)
    weight = hass.states.get("sensor.alex_weight")
    assert weight.attributes["unit_of_measurement"] == "lb"
    assert float(weight.state) == pytest.approx(10, abs=0.01)
    length = hass.states.get("sensor.alex_length")
    assert length.attributes["unit_of_measurement"] == "in"
    assert float(length.state) == pytest.approx(24, abs=0.05)  # stored to 0.1 cm


async def test_milestones(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    tracker = entry.runtime_data
    result = await call(hass, "set_milestone", response=True, milestone="first_smile", date="2026-02-10")
    assert result == {"milestone": "first_smile", "date": "2026-02-10"}
    # Changing the date, then undoing, restores the first date.
    await call(hass, "set_milestone", milestone="first_smile", date="2026-02-12", note="At grandma's")
    assert tracker.milestones_done["first_smile"]["note"] == "At grandma's"
    await call(hass, "undo")
    assert tracker.milestones_done["first_smile"]["date"].isoformat() == "2026-02-10"

    # Changing only the date keeps the note; an empty note removes it.
    await call(hass, "set_milestone", milestone="first_smile", date="2026-02-12", note="At grandma's")
    await call(hass, "set_milestone", milestone="first_smile", date="2026-02-11")
    assert tracker.milestones_done["first_smile"] == {
        "date": tracker.milestones_done["first_smile"]["date"],
        "note": "At grandma's",
    }
    await call(hass, "set_milestone", milestone="first_smile", date="2026-02-11", note="")
    assert tracker.milestones_done["first_smile"]["note"] is None

    await call(hass, "clear_milestone", milestone="first_smile")
    assert "first_smile" not in tracker.milestones_done
    await call(hass, "undo")
    assert "first_smile" in tracker.milestones_done
    # Clearing something not reached is a no-op.
    await call(hass, "clear_milestone", milestone="crawls")

    with pytest.raises(ServiceValidationError):
        await call(hass, "set_milestone", milestone="flies")


async def test_custom_milestones(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    tracker = entry.runtime_data
    result = await call(hass, "add_milestone", response=True, name="  First swim ", date="2026-06-01")
    key = result["milestone"]
    assert key.startswith("custom_")
    assert tracker.custom_milestones == [{"id": key, "name": "First swim"}]
    assert tracker.milestones_done[key]["date"].isoformat() == "2026-06-01"

    # Added without a date: listed but not reached; can be reached later.
    later = (await call(hass, "add_milestone", response=True, name="Says 'cat'"))["milestone"]
    assert later not in tracker.milestones_done
    await call(hass, "set_milestone", milestone=later, date="2026-07-01")

    await call(hass, "delete_milestone", milestone=key)
    assert [c["id"] for c in tracker.custom_milestones] == [later]
    await call(hass, "undo")
    assert [c["id"] for c in tracker.custom_milestones] == [key, later]
    assert key in tracker.milestones_done

    with pytest.raises(ServiceValidationError):
        await call(hass, "delete_milestone", milestone="first_steps")
    with pytest.raises(ServiceValidationError):
        await call(hass, "add_milestone", name="   ")


async def test_snapshot(hass: HomeAssistant, entry: MockConfigEntry, hass_ws_client) -> None:
    await call(hass, "log_growth", weight=4.2, length=55, date="2026-03-01")
    await call(hass, "set_milestone", milestone="crawls", date="2026-09-01")
    custom = (await call(hass, "add_milestone", response=True, name="First swim"))["milestone"]
    client = await hass_ws_client(hass)
    # Without the flags growth and milestones are left out.
    await client.send_json_auto_id({"type": "baby_logger/subscribe", "entry_id": entry.entry_id})
    assert (await client.receive_json())["success"]
    snap = (await client.receive_json())["event"]
    assert snap["growth"] is None
    assert snap["milestones"] is None
    await client.send_json_auto_id(
        {"type": "baby_logger/subscribe", "entry_id": entry.entry_id, "growth": True, "milestones": True}
    )
    assert (await client.receive_json())["success"]
    snap = (await client.receive_json())["event"]
    assert snap["birth_date"] is None
    assert snap["growth"] == [
        {
            "id": snap["growth"][0]["id"],
            "date": "2026-03-01",
            "weight_kg": 4.2,
            "length_cm": 55.0,
            "note": None,
        }
    ]
    milestones = {m["key"]: m for m in snap["milestones"]}
    assert len(snap["milestones"]) == len(MILESTONES) + 1
    assert milestones["crawls"]["date"] == "2026-09-01"
    assert milestones["first_steps"] == {
        "key": "first_steps",
        "name": "First steps on their own",
        "category": "movement",
        "months": 12,
        "cdc": False,
        "tags": ["walk", "walking", "steps", "step", "toddle"],
        "custom": False,
        "date": None,
        "note": None,
    }
    assert milestones[custom]["custom"] is True
    assert milestones[custom]["category"] == "custom"


async def test_persisted(hass: HomeAssistant, entry: MockConfigEntry, hass_storage: dict[str, Any]) -> None:
    await call(hass, "log_growth", weight=4.2, date="2026-03-01")
    await call(hass, "set_milestone", milestone="crawls", date="2026-09-01")
    custom = (await call(hass, "add_milestone", response=True, name="First swim", date="2026-06-01"))[
        "milestone"
    ]
    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    stored = hass_storage[f"{DOMAIN}.{entry.entry_id}"]["data"]
    assert stored["growth"][0]["date"] == "2026-03-01"
    assert stored["milestones"]["crawls"] == {"date": "2026-09-01", "note": None}
    tracker = entry.runtime_data
    assert tracker.growth[0]["weight_kg"] == 4.2
    assert tracker.milestones_done[custom]["date"].isoformat() == "2026-06-01"
    assert tracker.custom_milestones[0]["name"] == "First swim"


async def test_birth_date_in_config_flow(hass: HomeAssistant) -> None:
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_USER})
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"name": "Sam", "birth_date": "2026-01-15"}
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["data"] == {"name": "Sam", "birth_date": "2026-01-15"}
    await hass.async_block_till_done()
    entry = hass.config_entries.async_entries(DOMAIN)[0]
    assert entry.runtime_data.birth_date.isoformat() == "2026-01-15"

    # Reconfigure can change or remove it.
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_RECONFIGURE, "entry_id": entry.entry_id}
    )
    result = await hass.config_entries.flow.async_configure(result["flow_id"], {"name": "Sam"})
    assert result["reason"] == "reconfigure_successful"
    await hass.async_block_till_done()
    assert entry.data == {"name": "Sam"}
    assert entry.runtime_data.birth_date is None


async def test_reconfigure_keeps_other_data(hass: HomeAssistant) -> None:
    entry = MockConfigEntry(domain=DOMAIN, title="Sam", data={"name": "Sam", "extra": 1})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": SOURCE_RECONFIGURE, "entry_id": entry.entry_id}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {"name": "Sammy", "birth_date": "2026-01-15"}
    )
    assert result["reason"] == "reconfigure_successful"
    assert entry.data == {"name": "Sammy", "extra": 1, "birth_date": "2026-01-15"}


async def test_dates_must_be_possible(hass: HomeAssistant) -> None:
    entry = MockConfigEntry(domain=DOMAIN, title="Sam", data={"name": "Sam", "birth_date": "2026-01-15"})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    tomorrow = (dt_util.now().date() + timedelta(days=1)).isoformat()

    async def run(action: str, **data: Any) -> None:
        await hass.services.async_call(
            DOMAIN, action, {"config_entry_id": entry.entry_id, **data}, blocking=True
        )

    for action, data in (
        ("log_growth", {"weight": 4.2}),
        ("set_milestone", {"milestone": "crawls"}),
        ("add_milestone", {"name": "First swim"}),
    ):
        with pytest.raises(ServiceValidationError) as err:
            await run(action, **data, date=tomorrow)
        assert err.value.translation_key == "date_in_future"
        with pytest.raises(ServiceValidationError) as err:
            await run(action, **data, date="2026-01-14")
        assert err.value.translation_key == "date_before_birth"
    # The birth day itself is fine, and so is a custom milestone without a date.
    await run("log_growth", weight=3.4, date="2026-01-15")
    await run("add_milestone", name="First swim")
    tracker = entry.runtime_data
    assert tracker.growth[0]["date"].isoformat() == "2026-01-15"
    assert tracker.custom_milestones[0]["name"] == "First swim"
    assert tracker.custom_milestones[0]["id"] not in tracker.milestones_done


async def test_catalogue_is_consistent() -> None:
    keys = [m.key for m in MILESTONES]
    assert len(keys) == len(set(keys))
    assert all(m.months is None or 1 <= m.months <= 36 for m in MILESTONES)
    # Every built-in milestone has search tags: lower case, no duplicates.
    for m in MILESTONES:
        assert m.tags, m.key
        assert all(t == t.strip().lower() and t for t in m.tags), m.key
        assert len(m.tags) == len(set(m.tags)), m.key
