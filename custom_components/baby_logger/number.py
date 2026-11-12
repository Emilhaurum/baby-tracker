"""Settings number for Baby Tracker."""

from __future__ import annotations

from homeassistant.components.number import NumberEntity, NumberEntityDescription, NumberMode
from homeassistant.const import EntityCategory, UnitOfTime
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import BabyTrackerConfigEntry
from .const import MAX_MERGE_MINUTES
from .entity import BabyTrackerEntity

PARALLEL_UPDATES = 0

MERGE_WINDOW = NumberEntityDescription(
    key="feeding_merge_window",
    translation_key="feeding_merge_window",
    entity_category=EntityCategory.CONFIG,
    native_min_value=0,
    native_max_value=MAX_MERGE_MINUTES,
    native_step=5,
    native_unit_of_measurement=UnitOfTime.MINUTES,
    mode=NumberMode.SLIDER,
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: BabyTrackerConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up the number."""
    async_add_entities([BabyMergeWindowNumber(entry.runtime_data, MERGE_WINDOW)])


class BabyMergeWindowNumber(BabyTrackerEntity, NumberEntity):
    """Feedings logged within this many minutes of the previous one are the same feeding."""

    @property
    def native_value(self) -> float:
        """Return the window in minutes."""
        return self.tracker.merge_minutes

    async def async_set_native_value(self, value: float) -> None:
        """Change the window."""
        self.tracker.async_set_merge_minutes(int(value))
