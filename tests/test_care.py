"""Tests for medicine & care: entries, types of the user's own and treatments."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from freezegun.api import FrozenDateTimeFactory
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ServiceValidationError
from homeassistant.util import dt as dt_util
from homeassistant.util.unit_system import US_CUSTOMARY_SYSTEM
import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_capture_events

from custom_components.baby_logger.const import DOMAIN, EVENT_BABY_TRACKER
from custom_components.baby_logger.logbook import describe

from .helpers import attrs, call, state


async def test_log_entries(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    events = async_capture_events(hass, EVENT_BABY_TRACKER)
    result = await call(hass, "log_entry", response=True, type="medicine", text=" Paracetamol 120 mg ")
    assert result["event"] == {
        "id": result["event"]["id"],
        "kind": "care",
        "start": result["event"]["start"],
        "end": None,
        "care_type": "medicine",
        "text": "Paracetamol 120 mg",
        "value": None,
        "treatment_id": None,
    }
    await call(hass, "log_entry", type="Temperature", value=38.44)
    await call(hass, "log_entry", type="note", text="Vaccination", value=3)
    tracker = entry.runtime_data
    assert [(e.care_type, e.text, e.value) for e in tracker.events] == [
        ("medicine", "Paracetamol 120 mg", None),
        ("temperature", None, 38.44),
        ("note", "Vaccination", None),
    ]
    assert [e.data["action"] for e in events] == ["care", "care", "care"]
    assert events[1].data["unit"] == "°C"
    assert events[1].data["emoji"] == "🌡️"
    assert describe(events[1].data, "da").startswith("🌡️ 38,44 °C")
    # Deleting and undoing work like for other entries.
    await call(hass, "delete_event", event_id=result["event"]["id"])
    assert len(tracker.events) == 2
    await call(hass, "undo")
    assert len(tracker.events) == 3
    # Undo of a new entry removes it.
    await call(hass, "log_entry", type="note", text="Spat up")
    await call(hass, "undo")
    assert len(tracker.events) == 3


async def test_entry_validation(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    for data, key in (
        ({"type": "medicine"}, "care_text_required"),
        ({"type": "note", "text": "  "}, "care_text_required"),
        ({"type": "temperature"}, "temperature_required"),
        ({"type": "temperature", "value": 50}, "temperature_out_of_range"),
        ({"type": "bath"}, "care_type_not_found"),
    ):
        with pytest.raises(ServiceValidationError) as err:
            await call(hass, "log_entry", **data)
        assert err.value.translation_key == key
    with pytest.raises(ServiceValidationError) as err:
        await call(hass, "log_entry", type="note", text="x", time=dt_util.now() + timedelta(hours=1))
    assert err.value.translation_key == "time_in_future"


async def test_temperature_sensor_and_fahrenheit(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    assert state(hass, "sensor.alex_temperature") == "unknown"
    await call(hass, "log_entry", type="temperature", value=101.3, units="imperial")
    event = entry.runtime_data.events[-1]
    assert event.value == pytest.approx(38.5, abs=0.01)
    assert float(state(hass, "sensor.alex_temperature")) == pytest.approx(38.5, abs=0.01)
    assert attrs(hass, "sensor.alex_temperature")["measured"] == event.start.isoformat()


async def test_temperature_sensor_follows_unit_system(
    hass: HomeAssistant, mock_entry: MockConfigEntry
) -> None:
    hass.config.units = US_CUSTOMARY_SYSTEM
    mock_entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(mock_entry.entry_id)
    await hass.async_block_till_done()
    await call(hass, "log_entry", type="temperature", value=38.5)
    assert float(state(hass, "sensor.alex_temperature")) == pytest.approx(101.3, abs=0.01)


async def test_own_types(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    tracker = entry.runtime_data
    bath = (await call(hass, "add_care_type", response=True, name="Bath", emoji="🛁"))["care_type"]
    pump = (await call(hass, "add_care_type", response=True, name="Pumping", unit="ml"))["care_type"]
    assert [(c["name"], c["emoji"], c["unit"]) for c in tracker.care_types] == [
        ("Bath", "🛁", None),
        ("Pumping", "⭐", "ml"),
    ]
    for name in ("bath", "Medicine"):
        with pytest.raises(ServiceValidationError) as err:
            await call(hass, "add_care_type", name=name)
        assert err.value.translation_key == "care_type_exists"
    with pytest.raises(ServiceValidationError) as err:
        await call(hass, "add_care_type", name="  ")
    assert err.value.translation_key == "care_name_empty"
    # By name (any case) or id; a number is kept for types with a unit.
    events = async_capture_events(hass, EVENT_BABY_TRACKER)
    await call(hass, "log_entry", type="BATH")
    await call(hass, "log_entry", type=pump, value=120, text="left")
    assert [(e.care_type, e.value, e.text) for e in tracker.events] == [
        (bath, None, None),
        (pump, 120, "left"),
    ]
    assert describe(events[0].data).startswith("🛁 Bath (")
    assert describe(events[1].data).startswith("⭐ Pumping: left 120 ml (")
    # Deleting hides the type but keeps its entries (and their name).
    await call(hass, "delete_care_type", care_type="Bath")
    assert tracker.care_types[0]["deleted"] is True
    assert tracker.care_label(tracker.events[0]) == "Bath"
    with pytest.raises(ServiceValidationError):
        await call(hass, "log_entry", type=bath)
    await call(hass, "undo")
    assert tracker.care_types[0]["deleted"] is False
    await call(hass, "delete_care_type", care_type=bath)
    await call(hass, "delete_care_type", care_type=bath)  # already deleted: nothing happens
    # A new type may reuse a deleted type's name.
    await call(hass, "add_care_type", name="Bath")
    await call(hass, "undo")
    assert len(tracker.care_types) == 2
    with pytest.raises(ServiceValidationError) as err:
        await call(hass, "delete_care_type", care_type="Nope")
    assert err.value.translation_key == "care_type_not_found"


async def test_treatment(hass: HomeAssistant, entry: MockConfigEntry, freezer: FrozenDateTimeFactory) -> None:
    freezer.move_to("2026-05-04 08:00:00+02:00")
    tracker = entry.runtime_data
    assert state(hass, "sensor.alex_next_dose") == "unknown"
    result = await call(
        hass, "add_treatment", response=True, name="Paracetamol", dose="120 mg", every_hours=6, days=2
    )
    treatment = result["treatment"]
    tid = treatment["id"]
    assert treatment["label"] == "Paracetamol 120 mg"
    assert treatment["start"] == "2026-05-04T06:00:00+00:00"
    assert treatment["end"] == "2026-05-06T06:00:00+00:00"
    # Due at once until the first dose.
    assert treatment["next_dose"] == treatment["start"]
    assert dt_util.parse_datetime(state(hass, "sensor.alex_next_dose")) == dt_util.parse_datetime(
        treatment["start"]
    )
    assert attrs(hass, "sensor.alex_next_dose")["treatment"] == "Paracetamol 120 mg"

    freezer.tick(timedelta(minutes=10))
    events = async_capture_events(hass, EVENT_BABY_TRACKER)
    dose = (await call(hass, "give_dose", response=True, treatment_id=tid))["event"]
    assert (dose["care_type"], dose["text"], dose["treatment_id"]) == ("medicine", "Paracetamol 120 mg", tid)
    assert events[0].data["action"] == "dose"
    assert describe(events[0].data, "da").startswith("💊 gav Paracetamol 120 mg")
    state_now = tracker.active_treatments()[0]
    assert state_now["doses"] == 1
    assert state_now["doses_today"] == 1
    assert state_now["next_dose"] == "2026-05-04T12:10:00+00:00"
    assert state(hass, "sensor.alex_next_dose") == "2026-05-04T12:10:00+00:00"

    # Undo removes the dose again.
    await call(hass, "undo")
    assert tracker.active_treatments()[0]["doses"] == 0

    # Near the end no next dose is due; after the end the treatment is gone.
    await call(hass, "give_dose", treatment_id=tid, time=dt_util.parse_datetime("2026-05-04T08:05:00+02:00"))
    freezer.move_to("2026-05-06 05:00:00+02:00")
    await call(hass, "give_dose", treatment_id=tid)
    assert tracker.active_treatments()[0]["next_dose"] is None
    freezer.move_to("2026-05-06 09:00:00+02:00")
    assert tracker.active_treatments() == []
    assert tracker.next_dose() is None


async def test_treatment_until_stopped(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    tracker = entry.runtime_data
    as_needed = (await call(hass, "add_treatment", response=True, name="Nose drops"))["treatment"]
    assert as_needed["end"] is None
    assert as_needed["next_dose"] is None
    assert state(hass, "sensor.alex_next_dose") == "unknown"
    regular = (await call(hass, "add_treatment", response=True, name="Antibiotic", every_hours=8))[
        "treatment"
    ]
    assert attrs(hass, "sensor.alex_next_dose")["treatment_id"] == regular["id"]
    assert len(attrs(hass, "sensor.alex_next_dose")["treatments"]) == 2
    await call(hass, "stop_treatment", treatment_id=regular["id"])
    assert [t["id"] for t in tracker.active_treatments()] == [as_needed["id"]]
    await call(hass, "undo")
    assert len(tracker.active_treatments()) == 2
    await call(hass, "stop_treatment", treatment_id=regular["id"])
    await call(hass, "stop_treatment", treatment_id=regular["id"])  # already stopped: nothing happens
    # Adding can be undone too.
    await call(hass, "add_treatment", name="Vitamin D")
    await call(hass, "undo")
    assert len(tracker.treatments) == 2


async def test_treatment_validation(hass: HomeAssistant, entry: MockConfigEntry) -> None:
    tracker = entry.runtime_data
    for kwargs, key in (
        ({"name": " "}, "care_name_empty"),
        ({"name": "X", "every_hours": 0.1}, "every_hours_out_of_range"),
        ({"name": "X", "days": 0}, "days_out_of_range"),
    ):
        with pytest.raises(ServiceValidationError) as err:
            tracker.async_add_treatment(**kwargs)
        assert err.value.translation_key == key
    for service in ("give_dose", "stop_treatment"):
        with pytest.raises(ServiceValidationError) as err:
            await call(hass, service, treatment_id="nope")
        assert err.value.translation_key == "treatment_not_found"


async def test_snapshot_and_suggestions(hass: HomeAssistant, entry: MockConfigEntry, hass_ws_client) -> None:
    await call(hass, "add_care_type", name="Bath", emoji="🛁")
    await call(hass, "log_entry", type="medicine", text="Vitamin D 10 µg")
    await call(hass, "log_entry", type="medicine", text="Paracetamol 120 mg")
    await call(hass, "log_entry", type="medicine", text="vitamin d 10 µg")
    await call(hass, "log_entry", type="temperature", value=37.2)
    await call(hass, "log_entry", type="note", text="Doctor")
    await call(hass, "add_treatment", name="Antibiotic", every_hours=8, days=7)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "baby_logger/subscribe", "entry_id": entry.entry_id})
    assert (await client.receive_json())["success"]
    snap = (await client.receive_json())["event"]
    care = snap["care"]
    assert [t["name"] for t in care["types"]] == ["Bath"]
    assert [t["label"] for t in care["treatments"]] == ["Antibiotic"]
    # Medicine suggestions: distinct (any case), newest first; temperatures and notes aren't suggested.
    assert care["recent"] == [
        {"care_type": "medicine", "text": "vitamin d 10 µg"},
        {"care_type": "medicine", "text": "Paracetamol 120 mg"},
    ]
    assert sum(1 for e in snap["events"] if e["kind"] == "care") == 5


async def test_persisted(hass: HomeAssistant, entry: MockConfigEntry, hass_storage: dict[str, Any]) -> None:
    await call(hass, "add_care_type", name="Bath")
    treatment = (await call(hass, "add_treatment", response=True, name="Antibiotic", every_hours=8, days=7))[
        "treatment"
    ]
    await call(hass, "give_dose", treatment_id=treatment["id"])
    await call(hass, "log_entry", type="temperature", value=37.9)
    await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    stored = hass_storage[f"{DOMAIN}.{entry.entry_id}"]["data"]
    assert stored["treatments"][0]["end"] == treatment["end"]
    tracker = entry.runtime_data
    assert tracker.care_types[0]["name"] == "Bath"
    assert tracker.active_treatments()[0]["doses"] == 1
    assert tracker.latest_temperature().value == 37.9
    assert tracker.diagnostics()["event_counts"]["care"] == 2
    assert tracker.diagnostics()["active_treatments"] == 1


def test_logbook_texts() -> None:
    base = {"time": "2026-05-04T08:00:00+00:00"}
    assert describe({**base, "action": "care", "care_type": "note", "emoji": "📝"}).startswith("📝 note (")
    assert describe({"action": "add_care_type", "type_name": "Bath"}) == "added entry type: Bath"
    assert describe({"action": "delete_care_type", "type_name": "Bath"}, "da") == "fjernede typen: Bath"
    assert describe({"action": "stop_treatment", "treatment_name": "X"}, "da") == "stoppede behandling: X"
    assert describe({"action": "undo", "undone": "dose"}, "da") == "↩️ fortrød seneste handling (dosis)"
    assert describe({"action": "delete", "kind": "care"}, "da") == "slettede en registrering (pleje)"
