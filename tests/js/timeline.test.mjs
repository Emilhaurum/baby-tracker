// Unit tests for the card's sleep timeline calculations.
//   TZ=Europe/Copenhagen node --test tests/js/
import assert from "node:assert/strict";
import { test } from "node:test";

// Minimal browser globals so the card module can be imported in Node.
globalThis.HTMLElement = class {};
globalThis.window = globalThis;
globalThis.customElements = { get: () => true, define: () => {} };

const { timelineRows, timelineSettings, timelineRangeStart, timelineAnchor } = await import(
  "../../custom_components/baby_tracker/frontend/baby-tracker-card.js"
);

const at = (s) => new Date(s);
const close = (actual, expected, msg) => assert.ok(Math.abs(actual - expected) < 1e-6, `${msg}: ${actual} != ${expected}`);

test("settings are clamped and lines rounded up", () => {
  assert.deepEqual(timelineSettings({ timeline_days: 14, timeline_group: 1, timeline_start_hour: 0 }), {
    group: 1,
    lines: 14,
    startHour: 0,
  });
  assert.deepEqual(timelineSettings({ timeline_days: 30, timeline_group: 7, timeline_start_hour: 18 }), {
    group: 7,
    lines: 5,
    startHour: 18,
  });
  assert.deepEqual(timelineSettings({ timeline_days: "x", timeline_group: 0, timeline_start_hour: 99 }), {
    group: 1,
    lines: 14,
    startHour: 23,
  });
});

test("anchor moves to yesterday before the start hour", () => {
  assert.deepEqual(timelineAnchor(at("2026-05-05T15:00:00"), 18), at("2026-05-04T18:00:00"));
  assert.deepEqual(timelineAnchor(at("2026-05-05T19:00:00"), 18), at("2026-05-05T18:00:00"));
});

test("one line per day with exact segments", () => {
  const now = at("2026-05-05T12:00:00");
  const sleeps = [
    [at("2026-05-04T21:00:00"), at("2026-05-05T06:00:00")],
    [at("2026-05-05T09:00:00"), at("2026-05-05T10:30:00")],
  ];
  const settings = timelineSettings({ timeline_days: 2, timeline_group: 1, timeline_start_hour: 0 });
  const [today, yesterday] = timelineRows(sleeps, settings, now);

  assert.deepEqual(today.start, at("2026-05-05T00:00:00"));
  close(today.elapsed, 0.5, "half of today has passed");
  assert.equal(today.segments.length, 2);
  close(today.segments[0][0], 0, "sleep carried over from last night starts at midnight");
  close(today.segments[0][1], 6 / 24, "until 06:00");
  close(today.segments[1][0], 9 / 24, "nap start");
  close(today.segments[1][1], 10.5 / 24, "nap end");
  close(today.hours, 7.5, "hours asleep so far today");

  close(yesterday.elapsed, 1, "yesterday is complete");
  close(yesterday.hours, 3, "21:00 to midnight");
});

test("start hour keeps a night on one line", () => {
  const now = at("2026-05-05T12:00:00");
  const sleeps = [[at("2026-05-04T21:00:00"), at("2026-05-05T06:00:00")]];
  const settings = timelineSettings({ timeline_days: 1, timeline_group: 1, timeline_start_hour: 18 });
  const [row] = timelineRows(sleeps, settings, now);
  assert.deepEqual(row.start, at("2026-05-04T18:00:00"));
  close(row.hours, 9, "the whole night is in this line");
  close(row.segments[0][0], 3 / 24, "starts 3 h into the line");
});

test("averaged lines report how often the baby is asleep per slot", () => {
  const now = at("2026-05-08T00:00:00");
  // Asleep 01:00-02:00 on both days, and 03:00-04:00 only on the second day.
  const sleeps = [
    [at("2026-05-06T01:00:00"), at("2026-05-06T02:00:00")],
    [at("2026-05-07T01:00:00"), at("2026-05-07T02:00:00")],
    [at("2026-05-07T03:00:00"), at("2026-05-07T04:00:00")],
  ];
  const settings = timelineSettings({ timeline_days: 2, timeline_group: 2, timeline_start_hour: 0 });
  // At midnight the current day has only just started, so the line covers the 6th and 7th.
  const rows = timelineRows(sleeps, settings, at("2026-05-07T23:59:59.999"));
  assert.equal(rows.length, 1);
  const [row] = rows;
  assert.equal(row.bins.length, 144);
  close(row.bins[6], 1, "01:00-01:10 asleep both days");
  close(row.bins[18], 0.5, "03:00-03:10 asleep one of two days");
  close(row.bins[60], 0, "10:00 awake");
  close(row.hours, 1.5, "average 1.5 h per day");
  assert.ok(now > row.start);
});

test("slots only average the days on which they have happened", () => {
  const settings = timelineSettings({ timeline_days: 1, timeline_group: 3, timeline_start_hour: 0 });
  const [row] = timelineRows([], settings, at("2026-05-05T12:00:00"));
  close(row.bins[0], 0, "past slots are awake");
  // The afternoon has happened on two of the three days.
  close(row.bins[100], 0, "afternoon from earlier days");
  assert.equal(row.bins.filter((b) => b === null).length, 0);
});

test("range start covers every line", () => {
  const settings = timelineSettings({ timeline_days: 14, timeline_group: 7, timeline_start_hour: 6 });
  assert.deepEqual(timelineRangeStart(settings, at("2026-05-05T12:00:00")), at("2026-04-22T06:00:00"));
});

test("daylight saving day is 23 hours long", () => {
  // Clocks go forward at 02:00 on 2026-03-29 in Copenhagen.
  const now = at("2026-03-30T12:00:00");
  const sleeps = [[at("2026-03-29T00:00:00"), at("2026-03-29T23:59:59.999")]];
  const settings = timelineSettings({ timeline_days: 2, timeline_group: 1, timeline_start_hour: 0 });
  const row = timelineRows(sleeps, settings, now)[1];
  close(Math.round(row.hours), 23, "a full DST day is 23 h");
  close(row.segments[0][1], 1, "fills the whole line");
});
