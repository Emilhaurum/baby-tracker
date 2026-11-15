"""Describe Baby Tracker events in the logbook (in English or Danish)."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from homeassistant.components.logbook import LOGBOOK_ENTRY_MESSAGE, LOGBOOK_ENTRY_NAME
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.util import dt as dt_util

from .const import DOMAIN, EVENT_BABY_TRACKER
from .milestones import localized_milestone_name

TEXTS: dict[str, dict[str, Any]] = {
    "en": {
        "diaper_types": {
            "wet": "💧 wet diaper",
            "dirty": "💩 dirty diaper",
            "both": "💧💩 wet and dirty diaper",
        },
        "diaper_default": "diaper",
        "sides": {"left": "left", "right": "right", "bottle": "bottle"},
        "kinds": {"diaper": "diaper", "feeding": "feeding", "sleep": "sleep"},
        "undone": {},
        "decimal": ".",
        "diaper": "logged a {diaper} ({at})",
        "first_side": "logged {side} as the first side of a feeding{amount} ({at})",
        "same_feeding": "switched to {side} in the same feeding{amount} ({at})",
        "feeding": "started a feeding: {side}{amount} ({at})",
        "sleep": "😴 fell asleep ({at})",
        "wake": "☀️ woke up after {hours}h {minutes:02d}m ({at})",
        "undo": "↩️ undid the last action ({undone})",
        "delete": "deleted a {kind} entry",
        "delete_unknown": "deleted a logged entry",
        "add_sleep": "😴 sleep added ({start}–{end})",
        "update_sleep": "😴 sleep changed",
        "growth": "📏 measured {values}",
        "delete_growth": "deleted a measurement",
        "milestone": "🏁 milestone: {name}",
        "add_milestone": "added milestone: {name}",
        "clear_milestone": "cleared milestone: {name}",
        "delete_milestone": "deleted milestone: {name}",
    },
    "da": {
        "diaper_types": {"wet": "💧 våd ble", "dirty": "💩 beskidt ble", "both": "💧💩 våd og beskidt ble"},
        "diaper_default": "ble",
        "sides": {"left": "venstre", "right": "højre", "bottle": "flaske"},
        "kinds": {"diaper": "ble", "feeding": "måltid", "sleep": "søvn"},
        # What was undone, by action.
        "undone": {
            "diaper": "ble",
            "feeding": "måltid",
            "sleep": "faldt i søvn",
            "wake": "vågnede",
            "add_sleep": "søvn tilføjet",
            "update_sleep": "søvn ændret",
            "delete": "sletning",
            "growth": "måling",
            "delete_growth": "sletning af måling",
            "milestone": "milepæl",
            "clear_milestone": "milepæl nulstillet",
            "add_milestone": "ny milepæl",
            "delete_milestone": "milepæl slettet",
        },
        "decimal": ",",
        "diaper": "registrerede en {diaper} ({at})",
        "first_side": "registrerede {side} som første side i et måltid{amount} ({at})",
        "same_feeding": "skiftede til {side} i samme måltid{amount} ({at})",
        "feeding": "startede et måltid: {side}{amount} ({at})",
        "sleep": "😴 faldt i søvn ({at})",
        "wake": "☀️ vågnede efter {hours}t {minutes:02d}m ({at})",
        "undo": "↩️ fortrød seneste handling ({undone})",
        "delete": "slettede en registrering ({kind})",
        "delete_unknown": "slettede en registrering",
        "add_sleep": "😴 søvn tilføjet ({start}–{end})",
        "update_sleep": "😴 søvn ændret",
        "growth": "📏 målte {values}",
        "delete_growth": "slettede en måling",
        "milestone": "🏁 milepæl: {name}",
        "add_milestone": "tilføjede milepæl: {name}",
        "clear_milestone": "nulstillede milepæl: {name}",
        "delete_milestone": "slettede milepæl: {name}",
    },
}


def _clock(value: str | None) -> str:
    parsed = dt_util.parse_datetime(value) if value else None
    return dt_util.as_local(parsed).strftime("%H:%M") if parsed else ""


def _language(language: str | None) -> str:
    code = (language or "en").lower().split("-")[0].split("_")[0]
    return code if code in TEXTS else "en"


def describe(data: dict[str, Any], language: str | None = "en") -> str:
    """Return a short human readable description of a logged action."""
    lang = _language(language)
    text = TEXTS[lang]
    action = data.get("action")
    at = _clock(data.get("time"))
    if action == "diaper":
        diaper = text["diaper_types"].get(data.get("type", ""), text["diaper_default"])
        return text["diaper"].format(diaper=diaper, at=at)
    if action == "feeding":
        side = text["sides"].get(data.get("side", ""), data.get("side", ""))
        amount = f", {data['amount_ml']:g} ml" if data.get("amount_ml") else ""
        key = (
            "first_side"
            if data.get("first_side")
            else "same_feeding"
            if data.get("same_feeding")
            else "feeding"
        )
        return text[key].format(side=side, amount=amount, at=at)
    if action == "sleep":
        return text["sleep"].format(at=at)
    if action == "wake":
        minutes = int(data.get("minutes") or 0)
        return text["wake"].format(hours=minutes // 60, minutes=minutes % 60, at=at)
    if action == "undo":
        undone = data.get("undone")
        return text["undo"].format(undone=text["undone"].get(undone, undone))
    if action == "delete":
        kind = data.get("kind")
        if not kind:
            return text["delete_unknown"]
        return text["delete"].format(kind=text["kinds"].get(kind, kind))
    if action == "add_sleep":
        return text["add_sleep"].format(start=_clock(data.get("start")), end=_clock(data.get("end")))
    if action == "update_sleep":
        return text["update_sleep"]
    if action == "growth":
        values = []
        for field, unit in (("weight_kg", "kg"), ("length_cm", "cm")):
            if data.get(field) is not None:
                values.append(f"{data[field]:g}".replace(".", text["decimal"]) + f" {unit}")
        return text["growth"].format(values=", ".join(values))
    if action == "delete_growth":
        return text["delete_growth"]
    if action in ("milestone", "add_milestone", "clear_milestone", "delete_milestone"):
        name = localized_milestone_name(str(data.get("milestone", "")), data.get("milestone_name", ""), lang)
        return text[action].format(name=name)
    return str(action)


@callback
def async_describe_events(
    hass: HomeAssistant,
    async_describe_event: Callable[[str, str, Callable[[Event], dict[str, str]]], None],
) -> None:
    """Describe logbook events."""

    @callback
    def async_describe(event: Event) -> dict[str, str]:
        return {
            LOGBOOK_ENTRY_NAME: event.data.get("name", "Baby"),
            LOGBOOK_ENTRY_MESSAGE: describe(event.data, hass.config.language),
        }

    async_describe_event(DOMAIN, EVENT_BABY_TRACKER, async_describe)
