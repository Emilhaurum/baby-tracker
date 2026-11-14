"""Describe Baby Tracker events in the logbook."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from homeassistant.components.logbook import LOGBOOK_ENTRY_MESSAGE, LOGBOOK_ENTRY_NAME
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.util import dt as dt_util

from .const import DOMAIN, EVENT_BABY_TRACKER

DIAPER = {"wet": "💧 wet diaper", "dirty": "💩 dirty diaper", "both": "💧💩 wet and dirty diaper"}
SIDES = {"left": "left", "right": "right", "bottle": "bottle"}


def _clock(value: str | None) -> str:
    parsed = dt_util.parse_datetime(value) if value else None
    return dt_util.as_local(parsed).strftime("%H:%M") if parsed else ""


def describe(data: dict[str, Any]) -> str:
    """Return a short human readable description of a logged action."""
    action = data.get("action")
    at = _clock(data.get("time"))
    if action == "diaper":
        return f"logged a {DIAPER.get(data.get('type', ''), 'diaper')} ({at})"
    if action == "feeding":
        side = SIDES.get(data.get("side", ""), data.get("side", ""))
        amount = f", {data['amount_ml']:g} ml" if data.get("amount_ml") else ""
        if data.get("first_side"):
            return f"logged {side} as the first side of a feeding{amount} ({at})"
        if data.get("same_feeding"):
            return f"switched to {side} in the same feeding{amount} ({at})"
        return f"started a feeding: {side}{amount} ({at})"
    if action == "sleep":
        return f"😴 fell asleep ({at})"
    if action == "wake":
        minutes = int(data.get("minutes") or 0)
        return f"☀️ woke up after {minutes // 60}h {minutes % 60:02d}m ({at})"
    if action == "undo":
        return f"↩️ undid the last action ({data.get('undone')})"
    if action == "delete":
        return f"deleted a {data.get('kind', 'logged')} entry"
    if action == "add_sleep":
        return f"😴 sleep added ({_clock(data.get('start'))}–{_clock(data.get('end'))})"
    if action == "update_sleep":
        return "😴 sleep changed"
    if action == "growth":
        parts = []
        if data.get("weight_kg") is not None:
            parts.append(f"{data['weight_kg']:g} kg")
        if data.get("length_cm") is not None:
            parts.append(f"{data['length_cm']:g} cm")
        return f"📏 measured {', '.join(parts)}"
    if action == "delete_growth":
        return "deleted a measurement"
    if action == "milestone":
        return f"🏁 milestone: {data.get('milestone_name', '')}"
    if action == "add_milestone":
        return f"added milestone: {data.get('milestone_name', '')}"
    if action == "clear_milestone":
        return f"cleared milestone: {data.get('milestone_name', '')}"
    if action == "delete_milestone":
        return f"deleted milestone: {data.get('milestone_name', '')}"
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
            LOGBOOK_ENTRY_MESSAGE: describe(event.data),
        }

    async_describe_event(DOMAIN, EVENT_BABY_TRACKER, async_describe)
