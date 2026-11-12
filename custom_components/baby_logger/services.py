"""Actions (services) of the Baby Tracker integration."""

from __future__ import annotations

from typing import TYPE_CHECKING

from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse, SupportsResponse, callback
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import config_validation as cv
import voluptuous as vol

from .const import (
    ATTR_AMOUNT_ML,
    ATTR_CONFIG_ENTRY_ID,
    ATTR_END,
    ATTR_EVENT_ID,
    ATTR_SIDE,
    ATTR_START,
    ATTR_TIME,
    ATTR_TYPE,
    DIAPER_TYPES,
    DOMAIN,
    FEEDING_SIDES,
    SERVICE_ADD_SLEEP,
    SERVICE_DELETE_EVENT,
    SERVICE_END_SLEEP,
    SERVICE_LOG_DIAPER,
    SERVICE_LOG_FEEDING,
    SERVICE_START_SLEEP,
    SERVICE_UNDO,
)

if TYPE_CHECKING:
    from .tracker import BabyTracker

BASE = {vol.Required(ATTR_CONFIG_ENTRY_ID): cv.string}
OPTIONAL_TIME = {vol.Optional(ATTR_TIME): cv.datetime}

SCHEMAS: dict[str, vol.Schema] = {
    SERVICE_LOG_DIAPER: vol.Schema({**BASE, vol.Required(ATTR_TYPE): vol.In(DIAPER_TYPES), **OPTIONAL_TIME}),
    SERVICE_LOG_FEEDING: vol.Schema(
        {
            **BASE,
            vol.Required(ATTR_SIDE): vol.In(FEEDING_SIDES),
            vol.Optional(ATTR_AMOUNT_ML): vol.All(vol.Coerce(float), vol.Range(min=0, max=2000)),
            **OPTIONAL_TIME,
        }
    ),
    SERVICE_START_SLEEP: vol.Schema({**BASE, **OPTIONAL_TIME}),
    SERVICE_END_SLEEP: vol.Schema({**BASE, **OPTIONAL_TIME}),
    SERVICE_ADD_SLEEP: vol.Schema(
        {**BASE, vol.Required(ATTR_START): cv.datetime, vol.Required(ATTR_END): cv.datetime}
    ),
    SERVICE_UNDO: vol.Schema(BASE),
    SERVICE_DELETE_EVENT: vol.Schema({**BASE, vol.Required(ATTR_EVENT_ID): cv.string}),
}


def get_tracker(hass: HomeAssistant, entry_id: str) -> BabyTracker:
    """Return the tracker of a loaded config entry."""
    entry = hass.config_entries.async_get_entry(entry_id)
    if entry is None or entry.domain != DOMAIN:
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="entry_not_found",
            translation_placeholders={"entry_id": entry_id},
        )
    if entry.state is not ConfigEntryState.LOADED:
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="entry_not_loaded",
            translation_placeholders={"name": entry.title},
        )
    return entry.runtime_data


@callback
def async_setup_services(hass: HomeAssistant) -> None:
    """Register the integration's actions."""

    async def log_diaper(call: ServiceCall) -> ServiceResponse:
        tracker = get_tracker(hass, call.data[ATTR_CONFIG_ENTRY_ID])
        event = tracker.async_log_diaper(call.data[ATTR_TYPE], call.data.get(ATTR_TIME))
        return {"event": event.as_dict()}

    async def log_feeding(call: ServiceCall) -> ServiceResponse:
        tracker = get_tracker(hass, call.data[ATTR_CONFIG_ENTRY_ID])
        event, merged = tracker.async_log_feeding(
            call.data[ATTR_SIDE], call.data.get(ATTR_AMOUNT_ML), call.data.get(ATTR_TIME)
        )
        return {"event": event.as_dict(), "same_feeding": merged}

    async def start_sleep(call: ServiceCall) -> ServiceResponse:
        tracker = get_tracker(hass, call.data[ATTR_CONFIG_ENTRY_ID])
        start = tracker.async_start_sleep(call.data.get(ATTR_TIME))
        return {"start": start.isoformat()}

    async def end_sleep(call: ServiceCall) -> ServiceResponse:
        tracker = get_tracker(hass, call.data[ATTR_CONFIG_ENTRY_ID])
        event = tracker.async_end_sleep(call.data.get(ATTR_TIME))
        return {"event": event.as_dict() if event else None}

    async def add_sleep(call: ServiceCall) -> ServiceResponse:
        tracker = get_tracker(hass, call.data[ATTR_CONFIG_ENTRY_ID])
        event = tracker.async_add_sleep(call.data[ATTR_START], call.data[ATTR_END])
        return {"event": event.as_dict()}

    async def undo(call: ServiceCall) -> None:
        get_tracker(hass, call.data[ATTR_CONFIG_ENTRY_ID]).async_undo()

    async def delete_event(call: ServiceCall) -> None:
        get_tracker(hass, call.data[ATTR_CONFIG_ENTRY_ID]).async_delete_event(call.data[ATTR_EVENT_ID])

    for name, handler in (
        (SERVICE_LOG_DIAPER, log_diaper),
        (SERVICE_LOG_FEEDING, log_feeding),
        (SERVICE_START_SLEEP, start_sleep),
        (SERVICE_END_SLEEP, end_sleep),
        (SERVICE_ADD_SLEEP, add_sleep),
    ):
        hass.services.async_register(
            DOMAIN, name, handler, schema=SCHEMAS[name], supports_response=SupportsResponse.OPTIONAL
        )
    hass.services.async_register(DOMAIN, SERVICE_UNDO, undo, schema=SCHEMAS[SERVICE_UNDO])
    hass.services.async_register(
        DOMAIN, SERVICE_DELETE_EVENT, delete_event, schema=SCHEMAS[SERVICE_DELETE_EVENT]
    )
