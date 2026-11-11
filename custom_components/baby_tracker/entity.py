"""Base entity for Baby Tracker."""

from __future__ import annotations

from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.entity import Entity, EntityDescription

from .const import DOMAIN
from .tracker import BabyTracker


class BabyTrackerEntity(Entity):
    """An entity belonging to one tracked baby."""

    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, tracker: BabyTracker, description: EntityDescription) -> None:
        """Initialize the entity."""
        self.tracker = tracker
        self.entity_description = description
        self._attr_unique_id = f"{tracker.entry_id}_{description.key}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, tracker.entry_id)},
            name=tracker.name,
            entry_type=DeviceEntryType.SERVICE,
            manufacturer="Baby Tracker",
            model="Baby",
        )

    async def async_added_to_hass(self) -> None:
        """Update whenever the tracker changes."""
        self.async_on_remove(self.tracker.async_add_listener(self.async_write_ha_state))
