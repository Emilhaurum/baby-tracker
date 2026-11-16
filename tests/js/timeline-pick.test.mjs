// Unit tests for tapping the sleep timeline: the sleep or awake period at a point.
//   TZ=Europe/Copenhagen node --test tests/js/*.test.mjs
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

globalThis.HTMLElement = class {};
globalThis.window = globalThis;
globalThis.customElements = { get: () => true, define: () => {} };

const { timelineRows, timelineSegmentAt, timelineSlotAt, timelinePick, setLanguage } = await import(
  "../../custom_components/baby_logger/frontend/baby-logger-card.js"
);

afterEach(() => setLanguage("en"));

const at = (s) => new Date(s);
// Local times in Copenhagen (UTC+2 in May).
const NOW = at("2026-05-05T15:00:00+02:00");
const SLEEPS = [
  [at("2026-05-03T21:00:00+02:00"), at("2026-05-04T06:00:00+02:00")],
  [at("2026-05-04T21:30:00+02:00"), at("2026-05-05T06:30:00+02:00")],
  [at("2026-05-05T12:20:00+02:00"), at("2026-05-05T13:50:00+02:00")],
];
const rows = (intervals, group = 1, lines = 2) => timelineRows(intervals, { group, lines, startHour: 0 }, NOW);
// Times as the card shows them in English (the browser's own format).
const hm = (iso) => at(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
// The fraction of a midnight-to-midnight line at a clock time.
const f = (hours, minutes = 0) => (hours * 60 + minutes) / (24 * 60);

test("a sleep across midnight is found whole", () => {
  const [today] = rows(SLEEPS);
  const seg = timelineSegmentAt(SLEEPS, today, f(3), NOW);
  assert.equal(seg.kind, "sleep");
  assert.equal(seg.from.toISOString(), at("2026-05-04T21:30:00+02:00").toISOString());
  assert.equal(seg.to.toISOString(), at("2026-05-05T06:30:00+02:00").toISOString());
  assert.equal(seg.ongoing, false);
});

test("an awake period between two sleeps", () => {
  const [today] = rows(SLEEPS);
  const seg = timelineSegmentAt(SLEEPS, today, f(9), NOW);
  assert.deepEqual(
    { kind: seg.kind, from: seg.from.toISOString(), to: seg.to.toISOString(), ongoing: seg.ongoing },
    { kind: "awake", from: at("2026-05-05T06:30:00+02:00").toISOString(), to: at("2026-05-05T12:20:00+02:00").toISOString(), ongoing: false }
  );
});

test("the period going on now, and the future", () => {
  const [today] = rows(SLEEPS);
  const awake = timelineSegmentAt(SLEEPS, today, f(14, 30), NOW);
  assert.equal(awake.kind, "awake");
  assert.equal(awake.ongoing, true);
  assert.equal(awake.to.getTime(), NOW.getTime());
  assert.equal(timelineSegmentAt(SLEEPS, today, f(16), NOW), null);
  // A sleep in progress (the card adds it as [start, now]).
  const sleeping = [...SLEEPS, [at("2026-05-05T14:00:00+02:00"), NOW]];
  const seg = timelineSegmentAt(sleeping, rows(sleeping)[0], f(14, 30), NOW);
  assert.equal(seg.kind, "sleep");
  assert.equal(seg.ongoing, true);
});

test("awake before the first loaded sleep has no known start", () => {
  const [, yesterday] = rows(SLEEPS.slice(1));
  const seg = timelineSegmentAt(SLEEPS.slice(1), yesterday, f(12), NOW);
  assert.equal(seg.kind, "awake");
  assert.equal(seg.from, null);
  assert.equal(seg.to.toISOString(), at("2026-05-04T21:30:00+02:00").toISOString());
});

test("texts and the highlighted part of the line", () => {
  const [today] = rows(SLEEPS);
  const sleep = timelinePick(SLEEPS, today, f(3), NOW);
  assert.equal(sleep.kind, "sleep");
  // The start is the evening before, so it gets its weekday.
  assert.equal(sleep.text, `Asleep Mon ${hm("2026-05-04T21:30:00+02:00")}–${hm("2026-05-05T06:30:00+02:00")} · 9h 00m`);
  // Highlighted from the start of today's line to 06:30.
  assert.equal(sleep.highlight[0], 0);
  assert.ok(Math.abs(sleep.highlight[1] - f(6, 30)) < 1e-9);
  assert.equal(
    timelinePick(SLEEPS, today, f(9), NOW).text,
    `Awake ${hm("2026-05-05T06:30:00+02:00")}–${hm("2026-05-05T12:20:00+02:00")} · 5h 50m`
  );
  assert.equal(timelinePick(SLEEPS, today, f(14, 30), NOW).text, `Awake since ${hm("2026-05-05T13:50:00+02:00")} · 1h 10m so far`);
  assert.equal(timelinePick(SLEEPS, today, f(16), NOW), null);
  setLanguage("da");
  assert.equal(timelinePick(SLEEPS, today, f(9), NOW).text, "Vågen 06.30–12.20 · 5t 50m");
});

test("lines averaging several days count the days asleep at that time", () => {
  const [line] = rows(SLEEPS, 3, 1);
  // 03:00 on 3, 4 and 5 May: asleep on the 4th and 5th (the night before the 3rd isn't logged).
  assert.deepEqual(
    (({ asleep, days }) => ({ asleep, days }))(timelineSlotAt(SLEEPS, line, f(3), NOW)),
    { asleep: 2, days: 3 }
  );
  // 16:00 hasn't happened yet today: only two days count.
  assert.deepEqual((({ asleep, days }) => ({ asleep, days }))(timelineSlotAt(SLEEPS, line, f(16), NOW)), { asleep: 0, days: 2 });
  assert.equal(timelinePick(SLEEPS, line, f(3), NOW).text, `${hm("2026-05-03T03:00:00+02:00")}: asleep on 2 of 3 days`);
});
