"""Tests for the pure sleep statistics."""

from __future__ import annotations

from datetime import datetime, time
from zoneinfo import ZoneInfo

from custom_components.baby_logger.stats import average, night_day_stats, overlap_seconds

TZ = ZoneInfo("Europe/Copenhagen")


def dt(day: int, hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 3, day, hour, minute, tzinfo=TZ)


def test_overlap() -> None:
    intervals = [(dt(1, 1), dt(1, 3)), (dt(1, 5), dt(1, 6))]
    assert overlap_seconds(intervals, dt(1, 2), dt(1, 5, 30)) == 1.5 * 3600
    assert overlap_seconds(intervals, dt(1, 7), dt(1, 8)) == 0


def test_night_and_day_split() -> None:
    # Night of the 1st: 22:30-02:00, wakes, 02:30-07:00. Nap on the 2nd 13:00-14:30.
    intervals = [
        (dt(1, 22, 30), dt(2, 2)),
        (dt(2, 2, 30), dt(2, 7)),
        (dt(2, 13), dt(2, 14, 30)),
    ]
    now = dt(2, 16)
    nights, days = night_day_stats(intervals, time(22), time(9), now, days=3)

    # Night of the 2nd hasn't started yet, so the newest night is the 1st.
    assert nights[0].date == "2026-03-01"
    assert nights[0].done
    assert nights[0].asleep == 8.0
    assert nights[0].awake == 3.0
    assert nights[0].wakes == 1
    assert nights[0].sleeps == 2

    # Daytime of the 2nd is ongoing: 09:00-16:00 so far.
    assert days[0].date == "2026-03-02"
    assert not days[0].done
    assert days[0].asleep == 1.5
    assert days[0].awake == 5.5
    assert days[0].sleeps == 1

    assert average(nights, "asleep", 7, 2) == 8.0
    assert average(days, "asleep", 7, 2) is None  # only finished days with sleep count


def test_night_not_crossing_midnight() -> None:
    # Night 00:30 -> 06:00 (both after midnight).
    intervals = [(dt(2, 1), dt(2, 5))]
    nights, days = night_day_stats(intervals, time(0, 30), time(6), dt(2, 12), days=1)
    assert nights[0].asleep == 4.0
    assert nights[0].done
    assert days[0].start == dt(2, 6)
    assert days[0].end == dt(3, 0, 30)


def test_dst_change() -> None:
    # Clocks go forward 02:00 -> 03:00 on 2026-03-29 in Copenhagen: the night is an hour shorter.
    # 22:00 -> 09:00 wall clock is only 10 real hours.
    intervals = [(datetime(2026, 3, 28, 22, tzinfo=TZ), datetime(2026, 3, 29, 9, tzinfo=TZ))]
    now = datetime(2026, 3, 29, 12, tzinfo=TZ)
    nights, _ = night_day_stats(intervals, time(22), time(9), now, days=2)
    night = next(n for n in nights if n.date == "2026-03-28")
    assert night.asleep == 10.0
    assert night.awake == 0.0
