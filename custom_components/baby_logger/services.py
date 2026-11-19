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
    ATTR_CARE_TYPE,
    ATTR_CONFIG_ENTRY_ID,
    ATTR_DATE,
    ATTR_DAYS,
    ATTR_DOSE,
    ATTR_EMOJI,
    ATTR_END,
    ATTR_EVENT_ID,
    ATTR_EVERY_HOURS,
    ATTR_LENGTH,
    ATTR_MILESTONE,
    ATTR_NAME,
    ATTR_NOTE,
    ATTR_SIDE,
    ATTR_START,
    ATTR_TEXT,
    ATTR_TIME,
    ATTR_TREATMENT,
    ATTR_TYPE,
    ATTR_UNIT,
    ATTR_UNITS,
    ATTR_VALUE,
    ATTR_WEIGHT,
    CARE_TEMPERATURE,
    CM_PER_INCH,
    DIAPER_TYPES,
    DOMAIN,
    FEEDING_SIDES,
    KG_PER_LB,
    MAX_EVERY_HOURS,
    MAX_TREATMENT_DAYS,
    MIN_EVERY_HOURS,
    SERVICE_ADD_CARE_TYPE,
    SERVICE_ADD_MILESTONE,
    SERVICE_ADD_SLEEP,
    SERVICE_ADD_TREATMENT,
    SERVICE_CLEAR_MILESTONE,
    SERVICE_DELETE_CARE_TYPE,
    SERVICE_DELETE_EVENT,
    SERVICE_DELETE_GROWTH,
    SERVICE_DELETE_MILESTONE,
    SERVICE_END_SLEEP,
    SERVICE_GIVE_DOSE,
    SERVICE_LOG_DIAPER,
    SERVICE_LOG_ENTRY,
    SERVICE_LOG_FEEDING,
    SERVICE_LOG_GROWTH,
    SERVICE_SET_MILESTONE,
    SERVICE_START_SLEEP,
    SERVICE_STOP_TREATMENT,
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
    SERVICE_LOG_ENTRY: vol.Schema(
        {
            **BASE,
            vol.Required(ATTR_TYPE): vol.All(cv.string, vol.Length(min=1, max=50)),
            vol.Optional(ATTR_TEXT): vol.All(cv.string, vol.Length(max=200)),
            vol.Optional(ATTR_VALUE): vol.Coerce(float),
            vol.Optional(ATTR_UNITS, default=UNITS_METRIC): vol.In([UNITS_METRIC, UNITS_IMPERIAL]),
            **OPTIONAL_TIME,
        }
    ),
    SERVICE_ADD_CARE_TYPE: vol.Schema(
        {
            **BASE,
            vol.Required(ATTR_NAME): vol.All(cv.string, vol.Length(min=1, max=50)),
            vol.Optional(ATTR_EMOJI): vol.All(cv.string, vol.Length(max=8)),
            vol.Optional(ATTR_UNIT): vol.All(cv.string, vol.Length(max=12)),
        }
    ),
    SERVICE_DELETE_CARE_TYPE: vol.Schema({**BASE, vol.Required(ATTR_CARE_TYPE): cv.string}),
    SERVICE_ADD_TREATMENT: vol.Schema(
        {
            **BASE,
            vol.Required(ATTR_NAME): vol.All(cv.string, vol.Length(min=1, max=100)),
            vol.Optional(ATTR_DOSE): vol.All(cv.string, vol.Length(max=50)),
            vol.Optional(ATTR_EVERY_HOURS): vol.All(
                vol.Coerce(float), vol.Range(min=MIN_EVERY_HOURS, max=MAX_EVERY_HOURS)
            ),
            vol.Optional(ATTR_DAYS): vol.All(vol.Coerce(int), vol.Range(min=1, max=MAX_TREATMENT_DAYS)),
            vol.Optional(ATTR_START): cv.datetime,
        }
    ),
    SERVICE_GIVE_DOSE: vol.Schema({**BASE, vol.Required(ATTR_TREATMENT): cv.string, **OPTIONAL_TIME}),
    SERVICE_STOP_TREATMENT: vol.Schema({**BASE, vol.Required(ATTR_TREATMENT): cv.string}),
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
        return {"measurement": tracker.growth_as_dict(entry)}

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
    _async_setup_care_services(hass)


@callback
def _async_setup_care_services(hass: HomeAssistant) -> None:
    """Register the medicine & care actions."""

    async def log_entry(call: ServiceCall) -> ServiceResponse:
        tracker = get_tracker(hass, call.data[ATTR_CONFIG_ENTRY_ID])
        value = call.data.get(ATTR_VALUE)
        care_type = call.data[ATTR_TYPE]
        if (
            value is not None
            and call.data[ATTR_UNITS] == UNITS_IMPERIAL
            and care_type.strip().casefold() == CARE_TEMPERATURE
        ):
            value = (value - 32) * 5 / 9
        event = tracker.async_log_entry(care_type, call.data.get(ATTR_TEXT), value, call.data.get(ATTR_TIME))
        return {"event": event.as_dict()}

    async def add_care_type(call: ServiceCall) -> ServiceResponse:
        tracker = get_tracker(hass, call.data[ATTR_CONFIG_ENTRY_ID])
        type_id = tracker.async_add_care_type(
            call.data[ATTR_NAME], call.data.get(ATTR_EMOJI), call.data.get(ATTR_UNIT)
        )
        return {"care_type": type_id}

    async def delete_care_type(call: ServiceCall) -> None:
        get_tracker(hass, call.data[ATTR_CONFIG_ENTRY_ID]).async_delete_care_type(call.data[ATTR_CARE_TYPE])

    async def add_treatment(call: ServiceCall) -> ServiceResponse:
        tracker = get_tracker(hass, call.data[ATTR_CONFIG_ENTRY_ID])
        treatment = tracker.async_add_treatment(
            call.data[ATTR_NAME],
            call.data.get(ATTR_DOSE),
            call.data.get(ATTR_EVERY_HOURS),
            call.data.get(ATTR_DAYS),
            call.data.get(ATTR_START),
        )
        return {"treatment": tracker.treatment_state(treatment)}

    async def give_dose(call: ServiceCall) -> ServiceResponse:
        tracker = get_tracker(hass, call.data[ATTR_CONFIG_ENTRY_ID])
        event = tracker.async_give_dose(call.data[ATTR_TREATMENT], call.data.get(ATTR_TIME))
        return {"event": event.as_dict()}

    async def stop_treatment(call: ServiceCall) -> None:
        get_tracker(hass, call.data[ATTR_CONFIG_ENTRY_ID]).async_stop_treatment(call.data[ATTR_TREATMENT])

    for name, handler in (
        (SERVICE_LOG_ENTRY, log_entry),
        (SERVICE_ADD_CARE_TYPE, add_care_type),
        (SERVICE_ADD_TREATMENT, add_treatment),
        (SERVICE_GIVE_DOSE, give_dose),
    ):
        hass.services.async_register(
            DOMAIN, name, handler, schema=SCHEMAS[name], supports_response=SupportsResponse.OPTIONAL
        )
    for name, handler in (
        (SERVICE_DELETE_CARE_TYPE, delete_care_type),
        (SERVICE_STOP_TREATMENT, stop_treatment),
    ):
        hass.services.async_register(DOMAIN, name, handler, schema=SCHEMAS[name])
