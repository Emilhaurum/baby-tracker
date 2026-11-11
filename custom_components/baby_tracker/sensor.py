"""Sensors for Baby Tracker."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorEntityDescription,
    SensorStateClass,
)
from homeassistant.const import UnitOfTime, UnitOfVolume
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import BabyTrackerConfigEntry
from .const import DIAPER_TYPES, FEEDING_SIDES, KIND_DIAPER, KIND_FEEDING, SIDE_LEFT, SIDE_RIGHT
from .entity import BabyTrackerEntity
from .tracker import BabyTracker

PARALLEL_UPDATES = 0


def _last_diaper_attrs(t: BabyTracker) -> dict[str, Any]:
    event = t.latest(KIND_DIAPER)
    return {"type": event.diaper_type if event else None}


def _last_feeding_attrs(t: BabyTracker) -> dict[str, Any]:
    event = t.latest(KIND_FEEDING)
    if event is None:
        return {"side": None, "amount_ml": None, "sides": [], "last_switch": None}
    return {
        "side": event.side,
        "amount_ml": event.amount_ml,
        "sides": [s["side"] for s in event.sides],
        "last_switch": event.end.isoformat() if event.end else None,
    }


def _last_wake(t: BabyTracker) -> datetime | None:
    return t.last_wake


def _summary_attrs(summary: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in summary.items() if k != "asleep"}


@dataclass(frozen=True, kw_only=True)
class BabySensorDescription(SensorEntityDescription):
    """Describes a Baby Tracker sensor."""

    value_fn: Callable[[BabyTracker], Any]
    attrs_fn: Callable[[BabyTracker], dict[str, Any]] | None = None


SENSORS: tuple[BabySensorDescription, ...] = (
    BabySensorDescription(
        key="last_diaper",
        translation_key="last_diaper",
        device_class=SensorDeviceClass.TIMESTAMP,
        value_fn=lambda t: e.start if (e := t.latest(KIND_DIAPER)) else None,
        attrs_fn=_last_diaper_attrs,
    ),
    BabySensorDescription(
        key="last_diaper_type",
        translation_key="last_diaper_type",
        device_class=SensorDeviceClass.ENUM,
        options=list(DIAPER_TYPES),
        value_fn=lambda t: e.diaper_type if (e := t.latest(KIND_DIAPER)) else None,
    ),
    BabySensorDescription(
        key="diapers_today",
        translation_key="diapers_today",
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda t: sum(t.diapers_today().values()),
        attrs_fn=lambda t: t.diapers_today(),
    ),
    BabySensorDescription(
        key="last_feeding",
        translation_key="last_feeding",
        device_class=SensorDeviceClass.TIMESTAMP,
        value_fn=lambda t: e.start if (e := t.latest(KIND_FEEDING)) else None,
        attrs_fn=_last_feeding_attrs,
    ),
    BabySensorDescription(
        key="last_feeding_side",
        translation_key="last_feeding_side",
        device_class=SensorDeviceClass.ENUM,
        options=list(FEEDING_SIDES),
        value_fn=lambda t: e.side if (e := t.latest(KIND_FEEDING)) else None,
    ),
    BabySensorDescription(
        key="next_feeding_side",
        translation_key="next_feeding_side",
        device_class=SensorDeviceClass.ENUM,
        options=[SIDE_LEFT, SIDE_RIGHT],
        value_fn=lambda t: t.next_side(),
    ),
    BabySensorDescription(
        key="feedings_today",
        translation_key="feedings_today",
        state_class=SensorStateClass.MEASUREMENT,
        value_fn=lambda t: sum(t.feedings_today().values()),
        attrs_fn=lambda t: t.feedings_today(),
    ),
    BabySensorDescription(
        key="bottle_today",
        translation_key="bottle_today",
        device_class=SensorDeviceClass.VOLUME,
        state_class=SensorStateClass.TOTAL_INCREASING,
        native_unit_of_measurement=UnitOfVolume.MILLILITERS,
        suggested_display_precision=0,
        value_fn=lambda t: t.bottle_ml_today(),
    ),
    BabySensorDescription(
        key="sleep_today",
        translation_key="sleep_today",
        device_class=SensorDeviceClass.DURATION,
        state_class=SensorStateClass.MEASUREMENT,
        native_unit_of_measurement=UnitOfTime.HOURS,
        suggested_display_precision=1,
        value_fn=lambda t: t.sleep_today_hours(),
    ),
    BabySensorDescription(
        key="last_night_sleep",
        translation_key="last_night_sleep",
        device_class=SensorDeviceClass.DURATION,
        native_unit_of_measurement=UnitOfTime.HOURS,
        suggested_display_precision=1,
        value_fn=lambda t: t.last_night_summary()["asleep"],
        attrs_fn=lambda t: _summary_attrs(t.last_night_summary()),
    ),
    BabySensorDescription(
        key="daytime_sleep",
        translation_key="daytime_sleep",
        device_class=SensorDeviceClass.DURATION,
        native_unit_of_measurement=UnitOfTime.HOURS,
        suggested_display_precision=1,
        value_fn=lambda t: t.daytime_summary()["asleep"],
        attrs_fn=lambda t: _summary_attrs(t.daytime_summary()),
    ),
    BabySensorDescription(
        key="last_woke_up",
        translation_key="last_woke_up",
        device_class=SensorDeviceClass.TIMESTAMP,
        value_fn=_last_wake,
    ),
)

# Large attributes that should not be stored in the recorder history.
UNRECORDED = frozenset({"nights", "days", "sides"})


async def async_setup_entry(
    hass: HomeAssistant,
    entry: BabyTrackerConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up the sensors."""
    async_add_entities(BabySensor(entry.runtime_data, d) for d in SENSORS)


class BabySensor(BabyTrackerEntity, SensorEntity):
    """A Baby Tracker sensor."""

    entity_description: BabySensorDescription
    _unrecorded_attributes = UNRECORDED

    @property
    def native_value(self) -> Any:
        """Return the value."""
        return self.entity_description.value_fn(self.tracker)

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        """Return extra attributes."""
        if self.entity_description.attrs_fn is None:
            return None
        return self.entity_description.attrs_fn(self.tracker)
