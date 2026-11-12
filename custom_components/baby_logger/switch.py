"""Sleeping switch for Baby Tracker."""

from __future__ import annotations

from typing import Any

from homeassistant.components.switch import SwitchEntity, SwitchEntityDescription
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import BabyTrackerConfigEntry
from .entity import BabyTrackerEntity

PARALLEL_UPDATES = 0

SLEEPING = SwitchEntityDescription(key="sleeping", translation_key="sleeping")


async def async_setup_entry(
    hass: HomeAssistant,
    entry: BabyTrackerConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up the switch."""
    async_add_entities([BabySleepingSwitch(entry.runtime_data, SLEEPING)])


class BabySleepingSwitch(BabyTrackerEntity, SwitchEntity):
    """On while the baby is asleep. Turning it off stores the sleep."""

    @property
    def is_on(self) -> bool:
        """Return True while sleeping."""
        return self.tracker.sleeping

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return when the current sleep (or wake period) started."""
        since = self.tracker.sleep_start if self.tracker.sleeping else self.tracker.last_wake
        return {"since": since.isoformat() if since else None}

    async def async_turn_on(self, **kwargs: Any) -> None:
        """Baby fell asleep."""
        if not self.tracker.sleeping:
            self.tracker.async_start_sleep()

    async def async_turn_off(self, **kwargs: Any) -> None:
        """Baby woke up."""
        if self.tracker.sleeping:
            self.tracker.async_end_sleep()
