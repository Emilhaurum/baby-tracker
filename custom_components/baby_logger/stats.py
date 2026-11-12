"""Pure calculations for sleep statistics (no Home Assistant state access)."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta
from typing import Any

Interval = tuple[datetime, datetime]


def merge_intervals(intervals: Iterable[Interval]) -> list[Interval]:
    """Sort intervals and merge overlapping ones so no time is counted twice."""
    merged: list[Interval] = []
    for start, end in sorted((s.astimezone(UTC), e.astimezone(UTC)) for s, e in intervals):
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def overlap_seconds(intervals: Iterable[Interval], start: datetime, end: datetime) -> float:
    """Return how many seconds of the intervals fall inside [start, end)."""
    total = 0.0
    start, end = start.astimezone(UTC), end.astimezone(UTC)
    for i_start, i_end in merge_intervals(intervals):
        total += max(0.0, (min(i_end, end) - max(i_start, start)).total_seconds())
    return total


@dataclass(slots=True)
class WindowStats:
    """Sleep summary of one night or day window."""

    date: str
    start: datetime
    end: datetime
    asleep: float  # hours
    awake: float  # hours
    sleeps: int
    wakes: int
    done: bool

    def as_dict(self) -> dict[str, Any]:
        """Return a JSON friendly representation."""
        return {
            "date": self.date,
            "from": self.start.isoformat(),
            "to": self.end.isoformat(),
            "asleep": self.asleep,
            "awake": self.awake,
            "sleeps": self.sleeps,
            "wakes": self.wakes,
            "done": self.done,
        }


def _window(
    intervals: Sequence[Interval], date: str, start: datetime, stop: datetime, now: datetime
) -> WindowStats | None:
    # Arithmetic between datetimes sharing a tzinfo ignores DST changes, so use UTC.
    t0, t1 = start.astimezone(UTC), stop.astimezone(UTC)
    end = min(t1, now)
    if end <= t0:
        return None
    asleep = overlap_seconds(intervals, t0, end)
    sleeps = sum(1 for s, _ in intervals if t0 <= s < end)
    # A wake-up counts when a sleep ends inside the window and another one
    # starts again before the window ends.
    wakes = sum(
        1 for idx, (_, e) in enumerate(intervals[:-1]) if t0 < e < end and intervals[idx + 1][0] < end
    )
    return WindowStats(
        date=date,
        start=start,
        end=stop,
        asleep=round(asleep / 3600, 2),
        awake=round(((end - t0).total_seconds() - asleep) / 3600, 2),
        sleeps=sleeps,
        wakes=wakes,
        done=t1 <= now,
    )


def night_day_stats(
    intervals: Iterable[Interval],
    night_start: time,
    night_end: time,
    now: datetime,
    days: int,
) -> tuple[list[WindowStats], list[WindowStats]]:
    """Split sleep into nights (night_start -> night_end) and days (the rest).

    ``now`` must be a timezone aware local datetime. A night is labelled by the
    date of its evening. Both lists are ordered newest first and only contain
    windows that have already started.
    """
    tz = now.tzinfo
    ordered = merge_intervals(intervals)
    now_utc = now.astimezone(UTC)
    nights: list[WindowStats] = []
    day_list: list[WindowStats] = []
    today = now.date()
    for k in range(days):
        d = today - timedelta(days=k)
        night_t0 = datetime.combine(d, night_start, tz)
        night_t1 = datetime.combine(d + timedelta(days=1 if night_end <= night_start else 0), night_end, tz)
        day_t0 = datetime.combine(d, night_end, tz)
        day_t1 = datetime.combine(d + timedelta(days=0 if night_start > night_end else 1), night_start, tz)
        if (n := _window(ordered, d.isoformat(), night_t0, night_t1, now_utc)) is not None:
            nights.append(n)
        if (w := _window(ordered, d.isoformat(), day_t0, day_t1, now_utc)) is not None:
            day_list.append(w)
    return nights, day_list


def average(windows: Iterable[WindowStats], attr: str, count: int, digits: int) -> float | None:
    """Average ``attr`` over the newest ``count`` finished windows with any sleep."""
    picked = [w for w in windows if w.done and w.asleep > 0][:count]
    if not picked:
        return None
    return round(sum(getattr(w, attr) for w in picked) / len(picked), digits)
