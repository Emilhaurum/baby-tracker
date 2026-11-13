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
    ATTR_DATE,
    ATTR_END,
    ATTR_EVENT_ID,
    ATTR_LENGTH,
    ATTR_MILESTONE,
    ATTR_NAME,
    ATTR_NOTE,
    ATTR_SIDE,
    ATTR_START,
    ATTR_TIME,
    ATTR_TYPE,
    ATTR_UNITS,
    ATTR_WEIGHT,
    CM_PER_INCH,
    DIAPER_TYPES,
    DOMAIN,
    FEEDING_SIDES,
    KG_PER_LB,
    SERVICE_ADD_MILESTONE,
    SERVICE_ADD_SLEEP,
    SERVICE_CLEAR_MILESTONE,
    SERVICE_DELETE_EVENT,
    SERVICE_DELETE_GROWTH,
    SERVICE_DELETE_MILESTONE,
    SERVICE_END_SLEEP,
    SERVICE_LOG_DIAPER,
    SERVICE_LOG_FEEDING,
    SERVICE_LOG_GROWTH,
    SERVICE_SET_MILESTONE,
    SERVICE_START_SLEEP,
    SERVICE_UNDO,
    UNITS_IMPERIAL,
    UNITS_METRIC,
)

if TYPE_CHECKING:
    from .tracker import BabyTracker

BASE = {vol.Required(ATTR_CONFIG_ENTRY_ID): cv.string}
OPTIONAL_TIME = {vol.Optional(ATTR_TIME): cv.datetime}

OPTIONAL_DATE = {vol.Optional(ATTR_DATE): cv.date}
OPTIONAL_NOTE = {vol.Optional(ATTR_NOTE): vol.All(cv.string, vol.Length(max=255))}
POSITIVE = vol.All(vol.Coerce(float), vol.Range(min=0, min_included=False))

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
    SERVICE_LOG_GROWTH: vol.Schema(
        {
            **BASE,
            vol.Optional(ATTR_WEIGHT): POSITIVE,
            vol.Optional(ATTR_LENGTH): POSITIVE,
            vol.Optional(ATTR_UNITS, default=UNITS_METRIC): vol.In([UNITS_METRIC, UNITS_IMPERIAL]),
            **OPTIONAL_DATE,
            **OPTIONAL_NOTE,
        }
    ),
    SERVICE_DELETE_GROWTH: vol.Schema({**BASE, vol.Required(ATTR_EVENT_ID): cv.string}),
    SERVICE_SET_MILESTONE: vol.Schema(
        {**BASE, vol.Required(ATTR_MILESTONE): cv.string, **OPTIONAL_DATE, **OPTIONAL_NOTE}
    ),
    SERVICE_CLEAR_MILESTONE: vol.Schema({**BASE, vol.Required(ATTR_MILESTONE): cv.string}),
    SERVICE_ADD_MILESTONE: vol.Schema(
        {
            **BASE,
            vol.Required(ATTR_NAME): vol.All(cv.string, vol.Length(min=1, max=100)),
            **OPTIONAL_DATE,
            **OPTIONAL_NOTE,
        }
    ),
    SERVICE_DELETE_MILESTONE: vol.Schema({**BASE, vol.Required(ATTR_MILESTONE): cv.string}),
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

    async def log_growth(call: ServiceCall) -> ServiceResponse:
        tracker = get_tracker(hass, call.data[ATTR_CONFIG_ENTRY_ID])
        imperial = call.data[ATTR_UNITS] == UNITS_IMPERIAL
        weight = call.data.get(ATTR_WEIGHT)
        length = call.data.get(ATTR_LENGTH)
        entry = tracker.async_log_growth(
            call.data.get(ATTR_DATE),
            weight_kg=weight * KG_PER_LB if imperial and weight is not None else weight,
            length_cm=length * CM_PER_INCH if imperial and length is not None else length,
            note=call.data.get(ATTR_NOTE),
        )
        return {"measurement": {**entry, "date": entry["date"].isoformat()}}

    async def delete_growth(call: ServiceCall) -> None:
        get_tracker(hass, call.data[ATTR_CONFIG_ENTRY_ID]).async_delete_growth(call.data[ATTR_EVENT_ID])

    async def set_milestone(call: ServiceCall) -> ServiceResponse:
        tracker = get_tracker(hass, call.data[ATTR_CONFIG_ENTRY_ID])
        reached = tracker.async_set_milestone(
            call.data[ATTR_MILESTONE], call.data.get(ATTR_DATE), call.data.get(ATTR_NOTE)
        )
        return {"milestone": call.data[ATTR_MILESTONE], "date": reached.isoformat()}

    async def clear_milestone(call: ServiceCall) -> None:
        get_tracker(hass, call.data[ATTR_CONFIG_ENTRY_ID]).async_clear_milestone(call.data[ATTR_MILESTONE])

    async def add_milestone(call: ServiceCall) -> ServiceResponse:
        tracker = get_tracker(hass, call.data[ATTR_CONFIG_ENTRY_ID])
        key = tracker.async_add_milestone(
            call.data[ATTR_NAME], call.data.get(ATTR_DATE), call.data.get(ATTR_NOTE)
        )
        return {"milestone": key}

    async def delete_milestone(call: ServiceCall) -> None:
        get_tracker(hass, call.data[ATTR_CONFIG_ENTRY_ID]).async_delete_milestone(call.data[ATTR_MILESTONE])

    for name, handler in (
        (SERVICE_LOG_DIAPER, log_diaper),
        (SERVICE_LOG_FEEDING, log_feeding),
        (SERVICE_START_SLEEP, start_sleep),
        (SERVICE_END_SLEEP, end_sleep),
        (SERVICE_ADD_SLEEP, add_sleep),
        (SERVICE_LOG_GROWTH, log_growth),
        (SERVICE_SET_MILESTONE, set_milestone),
        (SERVICE_ADD_MILESTONE, add_milestone),
    ):
        hass.services.async_register(
            DOMAIN, name, handler, schema=SCHEMAS[name], supports_response=SupportsResponse.OPTIONAL
        )
    hass.services.async_register(DOMAIN, SERVICE_UNDO, undo, schema=SCHEMAS[SERVICE_UNDO])
    for name, handler in (
        (SERVICE_DELETE_EVENT, delete_event),
        (SERVICE_DELETE_GROWTH, delete_growth),
        (SERVICE_CLEAR_MILESTONE, clear_milestone),
        (SERVICE_DELETE_MILESTONE, delete_milestone),
    ):
        hass.services.async_register(DOMAIN, name, handler, schema=SCHEMAS[name])
