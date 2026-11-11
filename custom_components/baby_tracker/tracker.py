"""State and history of one tracked baby."""

from __future__ import annotations

import bisect
from collections.abc import Callable
import copy
from dataclasses import dataclass, field
from datetime import datetime, time, timedelta
import logging
from typing import Any
import uuid

from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.event import async_call_later, async_track_time_interval
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import (
    AVERAGE_OVER,
    DEFAULT_MERGE_MINUTES,
    DEFAULT_NIGHT_END,
    DEFAULT_NIGHT_START,
    DIAPER_TYPES,
    DOMAIN,
    EVENT_BABY_TRACKER,
    FEEDING_SIDES,
    KIND_DIAPER,
    KIND_FEEDING,
    KIND_SLEEP,
    MAX_MERGE_MINUTES,
    MIN_SLEEP_SECONDS,
    SIDE_BOTTLE,
    SIDE_LEFT,
    SIDE_RIGHT,
    STATS_DAYS,
    STORAGE_KEY_PREFIX,
    STORAGE_VERSION,
    UNDO_SECONDS,
)
from .stats import Interval, WindowStats, average, night_day_stats, overlap_seconds

_LOGGER = logging.getLogger(__name__)

SAVE_DELAY = 1


@dataclass(slots=True)
class BabyEvent:
    """A logged diaper change, feeding or finished sleep."""

    id: str
    kind: str
    start: datetime
    # Sleep: when the baby woke up. Feeding: time of the latest side switch.
    end: datetime | None = None
    diaper_type: str | None = None
    # Feeding: every side logged during this feeding, in order.
    sides: list[dict[str, Any]] = field(default_factory=list)
    amount_ml: float | None = None

    @property
    def side(self) -> str | None:
        """Return the latest side of a feeding."""
        return self.sides[-1]["side"] if self.sides else None

    def as_dict(self) -> dict[str, Any]:
        """Return a JSON friendly representation."""
        data: dict[str, Any] = {
            "id": self.id,
            "kind": self.kind,
            "start": self.start.isoformat(),
            "end": self.end.isoformat() if self.end else None,
        }
        if self.kind == KIND_DIAPER:
            data["diaper_type"] = self.diaper_type
        elif self.kind == KIND_FEEDING:
            data["sides"] = [{**s, "time": s["time"].isoformat()} for s in self.sides]
            data["side"] = self.side
            data["amount_ml"] = self.amount_ml
        return data

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> BabyEvent:
        """Create from a stored representation."""
        end = data.get("end")
        return cls(
            id=data["id"],
            kind=data["kind"],
            start=_parse(data["start"]),
            end=_parse(end) if end else None,
            diaper_type=data.get("diaper_type"),
            sides=[{**s, "time": _parse(s["time"])} for s in data.get("sides", [])],
            amount_ml=data.get("amount_ml"),
        )


def signal_update(entry_id: str) -> str:
    """Return the dispatcher signal sent when a baby's data changes."""
    return f"{DOMAIN}_update_{entry_id}"


def _parse(value: str) -> datetime:
    parsed = dt_util.parse_datetime(value)
    if parsed is None:
        raise ValueError(f"Invalid datetime: {value}")
    return dt_util.as_utc(parsed)


def _as_utc(when: datetime | None) -> datetime:
    if when is None:
        return dt_util.utcnow()
    if when.tzinfo is None:
        when = when.replace(tzinfo=dt_util.get_default_time_zone())
    return dt_util.as_utc(when)


@dataclass(slots=True)
class _Undo:
    action: str
    restore: Callable[[], None]
    expires: datetime


class BabyTracker:
    """Keeps the log and current state for one baby and persists it."""

    def __init__(self, hass: HomeAssistant, entry_id: str, name: str) -> None:
        """Initialize the tracker."""
        self.hass = hass
        self.entry_id = entry_id
        self.name = name
        self._store: Store[dict[str, Any]] = Store(hass, STORAGE_VERSION, f"{STORAGE_KEY_PREFIX}.{entry_id}")
        self.events: list[BabyEvent] = []
        self.sleep_start: datetime | None = None
        self.last_wake: datetime | None = None
        self.merge_minutes: int = DEFAULT_MERGE_MINUTES
        self.night_start: time = DEFAULT_NIGHT_START
        self.night_end: time = DEFAULT_NIGHT_END
        self._undo: _Undo | None = None
        self._cancel_undo: CALLBACK_TYPE | None = None
        self._cancel_tick: CALLBACK_TYPE | None = None
        self._listeners: list[CALLBACK_TYPE] = []
        self._stats_cache: tuple[tuple[int, datetime], Any] | None = None
        self._revision = 0

    # ------------------------------------------------------------------ setup

    async def async_load(self) -> None:
        """Load stored data and start the minute tick."""
        if (data := await self._store.async_load()) is not None:
            self.events = sorted(
                (BabyEvent.from_dict(e) for e in data.get("events", [])),
                key=lambda e: e.start,
            )
            if start := data.get("sleep_start"):
                self.sleep_start = _parse(start)
            if wake := data.get("last_wake"):
                self.last_wake = _parse(wake)
            settings = data.get("settings", {})
            self.merge_minutes = int(settings.get("merge_minutes", DEFAULT_MERGE_MINUTES))
            if value := settings.get("night_start"):
                self.night_start = time.fromisoformat(value)
            if value := settings.get("night_end"):
                self.night_end = time.fromisoformat(value)
        # Time based values (today's totals, ongoing sleep) change every minute.
        self._cancel_tick = async_track_time_interval(self.hass, self._async_tick, timedelta(minutes=1))

    async def async_unload(self) -> None:
        """Stop timers and write pending changes."""
        if self._cancel_tick:
            self._cancel_tick()
            self._cancel_tick = None
        if self._cancel_undo:
            self._cancel_undo()
            self._cancel_undo = None
        await self._store.async_save(self._data_to_save())

    async def async_remove(self) -> None:
        """Delete the stored data (config entry removed)."""
        await self._store.async_remove()

    def _data_to_save(self) -> dict[str, Any]:
        return {
            "events": [e.as_dict() for e in self.events],
            "sleep_start": self.sleep_start.isoformat() if self.sleep_start else None,
            "last_wake": self.last_wake.isoformat() if self.last_wake else None,
            "settings": {
                "merge_minutes": self.merge_minutes,
                "night_start": self.night_start.isoformat(),
                "night_end": self.night_end.isoformat(),
            },
        }

    # -------------------------------------------------------------- listeners

    @callback
    def async_add_listener(self, update_callback: CALLBACK_TYPE) -> CALLBACK_TYPE:
        """Register a callback for any change (including the minute tick)."""
        self._listeners.append(update_callback)

        @callback
        def remove() -> None:
            self._listeners.remove(update_callback)

        return remove

    @callback
    def async_notify(self) -> None:
        """Tell entities and dashboard subscriptions that something changed."""
        for listener in list(self._listeners):
            listener()
        # Websocket subscriptions follow the config entry, not this instance, so
        # they keep working when the entry is reloaded (e.g. after a rename).
        async_dispatcher_send(self.hass, signal_update(self.entry_id))

    @callback
    def _async_tick(self, _now: datetime) -> None:
        self.async_notify()

    @callback
    def _changed(self, action: str | None = None, data: dict[str, Any] | None = None) -> None:
        self._revision += 1
        self._store.async_delay_save(self._data_to_save, SAVE_DELAY)
        if action is not None:
            self.hass.bus.async_fire(
                EVENT_BABY_TRACKER,
                {"config_entry_id": self.entry_id, "name": self.name, "action": action, **(data or {})},
            )
        self.async_notify()

    # ------------------------------------------------------------------- undo

    @property
    def undo_available(self) -> bool:
        """Return True while the latest action can be undone."""
        return self._undo is not None

    @property
    def undo_action(self) -> str | None:
        """Return the action that would be undone."""
        return self._undo.action if self._undo else None

    @property
    def undo_expires(self) -> datetime | None:
        """Return when the undo window closes."""
        return self._undo.expires if self._undo else None

    @callback
    def _set_undo(self, action: str, restore: Callable[[], None]) -> None:
        if self._cancel_undo:
            self._cancel_undo()
        self._undo = _Undo(action, restore, dt_util.utcnow() + timedelta(seconds=UNDO_SECONDS))
        self._cancel_undo = async_call_later(self.hass, UNDO_SECONDS, self._expire_undo)

    @callback
    def _expire_undo(self, _now: datetime) -> None:
        self._cancel_undo = None
        self._undo = None
        self.async_notify()

    @callback
    def async_undo(self) -> str:
        """Revert the latest action. Returns the action that was undone."""
        if self._undo is None:
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key="nothing_to_undo")
        undo = self._undo
        self._undo = None
        if self._cancel_undo:
            self._cancel_undo()
            self._cancel_undo = None
        undo.restore()
        self._changed("undo", {"undone": undo.action})
        return undo.action

    # ---------------------------------------------------------------- helpers

    def _insert(self, event: BabyEvent) -> None:
        keys = [e.start for e in self.events]
        self.events.insert(bisect.bisect_right(keys, event.start), event)

    def _remove(self, event_id: str) -> None:
        self.events = [e for e in self.events if e.id != event_id]

    def get_event(self, event_id: str, kind: str | None = None) -> BabyEvent:
        """Return an event by id (optionally only of one kind)."""
        for event in self.events:
            if event.id == event_id and (kind is None or event.kind == kind):
                return event
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="event_not_found",
            translation_placeholders={"event_id": event_id},
        )

    def latest(self, kind: str) -> BabyEvent | None:
        """Return the most recent event of a kind."""
        for event in reversed(self.events):
            if event.kind == kind:
                return event
        return None

    # ---------------------------------------------------------------- actions

    @callback
    def async_log_diaper(self, diaper_type: str, when: datetime | None = None) -> BabyEvent:
        """Log a diaper change."""
        if diaper_type not in DIAPER_TYPES:
            raise ServiceValidationError(
                translation_domain=DOMAIN,
                translation_key="invalid_diaper_type",
                translation_placeholders={"type": str(diaper_type)},
            )
        event = BabyEvent(id=uuid.uuid4().hex, kind=KIND_DIAPER, start=_as_utc(when), diaper_type=diaper_type)
        self._insert(event)
        self._set_undo("diaper", lambda: self._remove(event.id))
        self._changed("diaper", {"type": diaper_type, "time": event.start.isoformat()})
        return event

    @callback
    def async_log_feeding(
        self, side: str, amount_ml: float | None = None, when: datetime | None = None
    ) -> tuple[BabyEvent, bool]:
        """Log a feeding (or a side switch within the current feeding).

        Returns the feeding and whether the entry was merged into the previous
        feeding because it was within the merge window.
        """
        if side not in FEEDING_SIDES:
            raise ServiceValidationError(
                translation_domain=DOMAIN,
                translation_key="invalid_side",
                translation_placeholders={"side": str(side)},
            )
        at = _as_utc(when)
        entry: dict[str, Any] = {"side": side, "time": at}
        if amount_ml is not None:
            entry["amount_ml"] = amount_ml

        previous = next(
            (e for e in reversed(self.events) if e.kind == KIND_FEEDING and e.start <= at),
            None,
        )
        window = timedelta(minutes=self.merge_minutes)
        # Merge when within the window of the latest switch, or when backdated to
        # a time inside the feeding itself.
        if previous is not None and at - (previous.end or previous.start) < window:
            before = (copy.copy(previous.sides), previous.end, previous.amount_ml)

            def restore() -> None:
                previous.sides, previous.end, previous.amount_ml = before

            previous.sides = sorted([*previous.sides, entry], key=lambda s: s["time"])
            previous.end = max(at, previous.end or previous.start)
            if amount_ml is not None:
                previous.amount_ml = (previous.amount_ml or 0) + amount_ml
            self._set_undo("feeding", restore)
            self._changed(
                "feeding",
                {"side": side, "amount_ml": amount_ml, "same_feeding": True, "time": at.isoformat()},
            )
            return previous, True

        event = BabyEvent(
            id=uuid.uuid4().hex,
            kind=KIND_FEEDING,
            start=at,
            end=at,
            sides=[entry],
            amount_ml=amount_ml,
        )
        self._insert(event)
        self._set_undo("feeding", lambda: self._remove(event.id))
        self._changed(
            "feeding", {"side": side, "amount_ml": amount_ml, "same_feeding": False, "time": at.isoformat()}
        )
        return event, False

    @property
    def sleeping(self) -> bool:
        """Return True while the baby is asleep."""
        return self.sleep_start is not None

    @callback
    def async_start_sleep(self, when: datetime | None = None) -> datetime:
        """Mark the baby as asleep."""
        if self.sleeping:
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key="already_sleeping")
        at = _as_utc(when)

        def restore() -> None:
            self.sleep_start = None

        self.sleep_start = at
        self._set_undo("sleep", restore)
        self._changed("sleep", {"time": at.isoformat()})
        return at

    @callback
    def async_end_sleep(self, when: datetime | None = None) -> BabyEvent | None:
        """Mark the baby as awake and store the finished sleep."""
        if self.sleep_start is None:
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key="not_sleeping")
        at = _as_utc(when)
        started = self.sleep_start
        if at <= started:
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key="end_before_start")
        previous_wake = self.last_wake
        event: BabyEvent | None = None
        # Very short sleeps are almost always an accidental double tap.
        if (at - started).total_seconds() >= MIN_SLEEP_SECONDS:
            event = BabyEvent(id=uuid.uuid4().hex, kind=KIND_SLEEP, start=started, end=at)
            self._insert(event)

        def restore() -> None:
            # Undoing the wake-up simply continues the original sleep.
            if event is not None:
                self._remove(event.id)
            self.sleep_start = started
            self.last_wake = previous_wake

        self.sleep_start = None
        self.last_wake = at
        self._set_undo("wake", restore)
        self._changed(
            "wake",
            {
                "time": at.isoformat(),
                "sleep_start": started.isoformat(),
                "minutes": round((at - started).total_seconds() / 60),
            },
        )
        return event

    @callback
    def async_add_sleep(self, start: datetime, end: datetime) -> BabyEvent:
        """Add a finished sleep after the fact."""
        start_utc, end_utc = _as_utc(start), _as_utc(end)
        if end_utc <= start_utc:
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key="end_before_start")
        event = BabyEvent(id=uuid.uuid4().hex, kind=KIND_SLEEP, start=start_utc, end=end_utc)
        self._insert(event)
        self._set_undo("add_sleep", lambda: self._remove(event.id))
        self._changed("add_sleep", {"start": start_utc.isoformat(), "end": end_utc.isoformat()})
        return event

    @callback
    def async_update_sleep(self, event_id: str, start: datetime, end: datetime) -> BabyEvent:
        """Change the times of a finished sleep."""
        event = self.get_event(event_id, KIND_SLEEP)
        start_utc, end_utc = _as_utc(start), _as_utc(end)
        if end_utc <= start_utc:
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key="end_before_start")
        old = (event.start, event.end)

        def restore() -> None:
            self._remove(event.id)
            event.start, event.end = old
            self._insert(event)

        self._remove(event.id)
        event.start, event.end = start_utc, end_utc
        self._insert(event)
        self._set_undo("update_sleep", restore)
        self._changed("update_sleep", {"event_id": event_id})
        return event

    @callback
    def async_delete_event(self, event_id: str, kind: str | None = None) -> None:
        """Delete a logged event."""
        event = self.get_event(event_id, kind)
        self._remove(event_id)
        self._set_undo("delete", lambda: self._insert(event))
        self._changed("delete", {"event_id": event_id, "kind": event.kind})

    @callback
    def async_set_merge_minutes(self, minutes: int) -> None:
        """Set the window in which feedings are merged."""
        self.merge_minutes = max(0, min(MAX_MERGE_MINUTES, int(minutes)))
        self._changed()

    @callback
    def async_set_night(self, *, start: time | None = None, end: time | None = None) -> None:
        """Set when the night starts / ends."""
        new_start = (start or self.night_start).replace(second=0, microsecond=0)
        new_end = (end or self.night_end).replace(second=0, microsecond=0)
        if new_start == new_end:
            raise ServiceValidationError(translation_domain=DOMAIN, translation_key="night_window_empty")
        if start is not None:
            self.night_start = start.replace(second=0, microsecond=0)
        if end is not None:
            self.night_end = end.replace(second=0, microsecond=0)
        self._changed()

    # ----------------------------------------------------------------- values

    def events_between(self, start: datetime, end: datetime) -> list[BabyEvent]:
        """Return events overlapping [start, end]."""
        return [e for e in self.events if e.start <= end and (e.end or e.start) >= start]

    def _today_events(self, kind: str, now: datetime | None = None) -> list[BabyEvent]:
        midnight = dt_util.start_of_local_day(now)
        return [e for e in self.events if e.kind == kind and e.start >= midnight]

    def diapers_today(self) -> dict[str, int]:
        """Return today's diaper count per type."""
        counts = dict.fromkeys(DIAPER_TYPES, 0)
        for event in self._today_events(KIND_DIAPER):
            counts[event.diaper_type or DIAPER_TYPES[0]] += 1
        return counts

    def feedings_today(self) -> dict[str, int]:
        """Return today's feeding count per (first) side."""
        counts = dict.fromkeys(FEEDING_SIDES, 0)
        for event in self._today_events(KIND_FEEDING):
            counts[event.sides[0]["side"] if event.sides else SIDE_LEFT] += 1
        return counts

    def bottle_ml_today(self) -> float:
        """Return how much was fed from a bottle today."""
        return sum(e.amount_ml or 0 for e in self._today_events(KIND_FEEDING))

    def next_side(self) -> str:
        """Return which breast to start with next time."""
        breast = next(
            (
                s["side"]
                for e in reversed(self.events)
                if e.kind == KIND_FEEDING
                for s in reversed(e.sides)
                if s["side"] != SIDE_BOTTLE
            ),
            None,
        )
        return SIDE_LEFT if breast != SIDE_LEFT else SIDE_RIGHT

    def sleep_intervals(self, now: datetime | None = None) -> list[Interval]:
        """Return all sleeps, including the ongoing one."""
        now = now or dt_util.utcnow()
        intervals: list[Interval] = [(e.start, e.end) for e in self.events if e.kind == KIND_SLEEP and e.end]
        if self.sleep_start is not None:
            intervals.append((self.sleep_start, max(now, self.sleep_start)))
        return intervals

    def sleep_today_hours(self) -> float:
        """Return hours slept since local midnight."""
        now = dt_util.utcnow()
        midnight = dt_util.start_of_local_day()
        return round(overlap_seconds(self.sleep_intervals(now), midnight, now) / 3600, 2)

    def night_day(self) -> tuple[list[WindowStats], list[WindowStats]]:
        """Return the night / day sleep statistics (cached per minute and change)."""
        now = dt_util.now().replace(second=0, microsecond=0)
        key = (self._revision, now)
        if self._stats_cache and self._stats_cache[0] == key:
            return self._stats_cache[1]
        since = now - timedelta(days=STATS_DAYS + 1)
        intervals = [
            (dt_util.as_local(s), dt_util.as_local(e)) for s, e in self.sleep_intervals() if e >= since
        ]
        result = night_day_stats(intervals, self.night_start, self.night_end, dt_util.now(), STATS_DAYS)
        self._stats_cache = (key, result)
        return result

    def last_night_summary(self) -> dict[str, Any]:
        """Return the latest finished night and averages."""
        nights, _ = self.night_day()
        done = [n for n in nights if n.done]
        last = done[0] if done else None
        return {
            "asleep": last.asleep if last else None,
            "awake": last.awake if last else None,
            "wakes": last.wakes if last else None,
            "from": last.start.isoformat() if last else None,
            "to": last.end.isoformat() if last else None,
            "avg_asleep": average(nights, "asleep", AVERAGE_OVER, 2),
            "avg_awake": average(nights, "awake", AVERAGE_OVER, 2),
            "avg_wakes": average(nights, "wakes", AVERAGE_OVER, 1),
            "nights": [n.as_dict() for n in nights],
        }

    def daytime_summary(self) -> dict[str, Any]:
        """Return today's daytime (or yesterday's before the night ends) and averages."""
        _, days = self.night_day()
        current = days[0] if days else None
        return {
            "asleep": current.asleep if current else None,
            "awake": current.awake if current else None,
            "naps": current.sleeps if current else None,
            "from": current.start.isoformat() if current else None,
            "to": current.end.isoformat() if current else None,
            "done": current.done if current else None,
            "avg_asleep": average(days, "asleep", AVERAGE_OVER, 2),
            "avg_awake": average(days, "awake", AVERAGE_OVER, 2),
            "avg_naps": average(days, "sleeps", AVERAGE_OVER, 1),
            "days": [d.as_dict() for d in days],
        }

    def snapshot(self, days: int) -> dict[str, Any]:
        """Return everything the dashboard card needs."""
        now = dt_util.utcnow()
        last_diaper = self.latest(KIND_DIAPER)
        last_feeding = self.latest(KIND_FEEDING)
        since = dt_util.start_of_local_day() - timedelta(days=days - 1)
        diapers = self.diapers_today()
        feedings = self.feedings_today()
        return {
            "entry_id": self.entry_id,
            "name": self.name,
            "now": now.isoformat(),
            "sleeping": self.sleeping,
            "sleep_start": self.sleep_start.isoformat() if self.sleep_start else None,
            "last_wake": self.last_wake.isoformat() if self.last_wake else None,
            "settings": {
                "merge_minutes": self.merge_minutes,
                "night_start": self.night_start.isoformat(),
                "night_end": self.night_end.isoformat(),
            },
            "undo": (
                {"action": self._undo.action, "expires": self._undo.expires.isoformat()}
                if self._undo
                else None
            ),
            "next_side": self.next_side(),
            "today": {
                "diapers": {"total": sum(diapers.values()), **diapers},
                "feedings": {"total": sum(feedings.values()), **feedings},
                "bottle_ml": self.bottle_ml_today(),
                "sleep_hours": self.sleep_today_hours(),
            },
            "last_diaper": last_diaper.as_dict() if last_diaper else None,
            "last_feeding": last_feeding.as_dict() if last_feeding else None,
            "last_night": self.last_night_summary(),
            "daytime": self.daytime_summary(),
            "events": [e.as_dict() for e in self.events_between(since, now)],
        }

    def diagnostics(self) -> dict[str, Any]:
        """Return non-personal debugging information."""
        counts = dict.fromkeys((KIND_DIAPER, KIND_FEEDING, KIND_SLEEP), 0)
        for event in self.events:
            counts[event.kind] = counts.get(event.kind, 0) + 1
        return {
            "event_counts": counts,
            "first_event": self.events[0].start.isoformat() if self.events else None,
            "last_event": self.events[-1].start.isoformat() if self.events else None,
            "sleeping": self.sleeping,
            "undo_available": self.undo_available,
            "settings": self._data_to_save()["settings"],
        }
