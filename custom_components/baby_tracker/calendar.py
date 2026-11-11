"""Editable sleep calendar for Baby Tracker."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from homeassistant.components.calendar import (
    EVENT_END,
    EVENT_START,
    CalendarEntity,
    CalendarEntityDescription,
    CalendarEntityFeature,
    CalendarEvent,
)
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.util import dt as dt_util

from . import BabyTrackerConfigEntry
from .const import DOMAIN, KIND_SLEEP
from .entity import BabyTrackerEntity
from .tracker import BabyEvent

PARALLEL_UPDATES = 0

SLEEP_CALENDAR = CalendarEntityDescription(key="sleep", translation_key="sleep")
SUMMARY = "😴 Sleep"


async def async_setup_entry(
    hass: HomeAssistant,
    entry: BabyTrackerConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up the calendar."""
    async_add_entities([BabySleepCalendar(entry.runtime_data, SLEEP_CALENDAR)])


def _to_calendar(event: BabyEvent) -> CalendarEvent:
    return CalendarEvent(
        start=dt_util.as_local(event.start),
        end=dt_util.as_local(event.end or event.start),
        summary=SUMMARY,
        uid=event.id,
    )


def _times(data: dict[str, Any]) -> tuple[datetime, datetime]:
    start, end = data[EVENT_START], data[EVENT_END]
    if not isinstance(start, datetime) or not isinstance(end, datetime):
        raise ServiceValidationError(translation_domain=DOMAIN, translation_key="all_day_sleep")
    return start, end


class BabySleepCalendar(BabyTrackerEntity, CalendarEntity):
    """All finished sleeps. Create, move or delete them to correct the log."""

    _attr_supported_features = (
        CalendarEntityFeature.CREATE_EVENT
        | CalendarEntityFeature.DELETE_EVENT
        | CalendarEntityFeature.UPDATE_EVENT
    )

    @property
    def event(self) -> CalendarEvent | None:
        """Return the ongoing sleep, if any."""
        if (start := self.tracker.sleep_start) is None:
            return None
        return CalendarEvent(
            start=dt_util.as_local(start),
            # Always a little in the future so the calendar shows as "on".
            end=dt_util.as_local(max(dt_util.utcnow(), start) + timedelta(minutes=1)),
            summary=SUMMARY,
        )

    async def async_get_events(
        self, hass: HomeAssistant, start_date: datetime, end_date: datetime
    ) -> list[CalendarEvent]:
        """Return sleeps within a range."""
        return [
            _to_calendar(e) for e in self.tracker.events_between(start_date, end_date) if e.kind == KIND_SLEEP
        ]

    async def async_create_event(self, **kwargs: Any) -> None:
        """Add a sleep."""
        start, end = _times(kwargs)
        self.tracker.async_add_sleep(start, end)

    async def async_update_event(
        self,
        uid: str,
        event: dict[str, Any],
        recurrence_id: str | None = None,
        recurrence_range: str | None = None,
    ) -> None:
        """Move a sleep."""
        start, end = _times(event)
        self.tracker.async_update_sleep(uid, start, end)

    async def async_delete_event(
        self,
        uid: str,
        recurrence_id: str | None = None,
        recurrence_range: str | None = None,
    ) -> None:
        """Delete a sleep."""
        self.tracker.async_delete_event(uid, KIND_SLEEP)
