"""Night start / end settings for Baby Tracker."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import time

from homeassistant.components.time import TimeEntity, TimeEntityDescription
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import BabyTrackerConfigEntry
from .entity import BabyTrackerEntity
from .tracker import BabyTracker

PARALLEL_UPDATES = 0


@dataclass(frozen=True, kw_only=True)
class BabyTimeDescription(TimeEntityDescription):
    """Describes a Baby Tracker time setting."""

    value_fn: Callable[[BabyTracker], time]
    set_fn: Callable[[BabyTracker, time], None]


TIMES: tuple[BabyTimeDescription, ...] = (
    BabyTimeDescription(
        key="night_start",
        translation_key="night_start",
        entity_category=EntityCategory.CONFIG,
        value_fn=lambda t: t.night_start,
        set_fn=lambda t, v: t.async_set_night(start=v),
    ),
    BabyTimeDescription(
        key="night_end",
        translation_key="night_end",
        entity_category=EntityCategory.CONFIG,
        value_fn=lambda t: t.night_end,
        set_fn=lambda t, v: t.async_set_night(end=v),
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: BabyTrackerConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up the time entities."""
    async_add_entities(BabyTime(entry.runtime_data, d) for d in TIMES)


class BabyTime(BabyTrackerEntity, TimeEntity):
    """A night window setting."""

    entity_description: BabyTimeDescription

    @property
    def native_value(self) -> time:
        """Return the time."""
        return self.entity_description.value_fn(self.tracker)

    async def async_set_value(self, value: time) -> None:
        """Change the time."""
        self.entity_description.set_fn(self.tracker, value)
