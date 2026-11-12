// Unit tests for the card's night sleep chart calculations.
//   TZ=Europe/Copenhagen node --test tests/js/*.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";

globalThis.HTMLElement = class {};
globalThis.window = globalThis;
globalThis.customElements = { get: () => true, define: () => {} };

const { parseClock, nightSettings, nightStats, nightsRangeStart } = await import(
  "../../custom_components/baby_logger/frontend/baby-logger-card.js"
);

const at = (s) => new Date(s);
const close = (actual, expected, msg) => assert.ok(Math.abs(actual - expected) < 1e-6, `${msg}: ${actual} != ${expected}`);

test("parseClock", () => {
  assert.equal(parseClock("21:30"), 21 * 60 + 30);
  assert.equal(parseClock("07:00:00"), 7 * 60);
  assert.equal(parseClock(""), null);
  assert.equal(parseClock("25:00"), null);
  assert.equal(parseClock(undefined), null);
});

test("night window comes from the card, else the integration", () => {
  const integration = { night_start: "22:00:00", night_end: "09:00:00" };
  assert.deepEqual(nightSettings({ night_days: 7 }, integration), { nights: 7, start: 1320, end: 540, custom: false });
  assert.deepEqual(nightSettings({ night_start: "20:00", night_end: "06:30" }, integration), {
    nights: 14,
    start: 1200,
    end: 390,
    custom: true,
  });
  // Only one time, or equal times, fall back to the integration.
  assert.equal(nightSettings({ night_start: "20:00" }, integration).start, 1320);
  assert.equal(nightSettings({ night_start: "20:00", night_end: "20:00" }, integration).custom, false);
  // Without integration settings the defaults are 22:00-09:00.
  assert.deepEqual(nightSettings({}, {}), { nights: 14, start: 1320, end: 540, custom: false });
});

test("asleep, awake and wake-ups per night", () => {
  const settings = nightSettings({ night_days: 2, night_start: "21:00", night_end: "07:00" });
  const sleeps = [
    // Night of the 3rd: 20:00-01:00 (only 21:00-01:00 counts), wakes, 01:30-06:00.
    [at("2026-05-03T20:00:00"), at("2026-05-04T01:00:00")],
    [at("2026-05-04T01:30:00"), at("2026-05-04T06:00:00")],
    // Nap outside the night.
    [at("2026-05-04T13:00:00"), at("2026-05-04T14:00:00")],
    // Night of the 4th, in progress.
    [at("2026-05-04T21:30:00"), at("2026-05-04T23:00:00")],
  ];
  const [first, second] = nightStats(sleeps, settings, at("2026-05-04T23:00:00"));

  assert.deepEqual(first.start, at("2026-05-03T21:00:00"));
  assert.deepEqual(first.end, at("2026-05-04T07:00:00"));
  assert.ok(first.done);
  close(first.length, 10, "night length");
  close(first.asleep, 8.5, "asleep");
  close(first.awake, 1.5, "awake");
  assert.equal(first.wakes, 1);

  assert.ok(!second.done);
  close(second.asleep, 1.5, "asleep so far");
  close(second.awake, 0.5, "awake so far");
  assert.equal(second.wakes, 0);
});

test("the newest night is the last one that has started", () => {
  const settings = nightSettings({ night_days: 3, night_start: "21:00", night_end: "07:00" });
  const nights = nightStats([], settings, at("2026-05-04T12:00:00"));
  assert.equal(nights.length, 3);
  assert.deepEqual(nights[2].start, at("2026-05-03T21:00:00"));
  assert.deepEqual(nightsRangeStart(settings, at("2026-05-04T12:00:00")), at("2026-05-01T21:00:00"));
});

test("a night that doesn't cross midnight", () => {
  const settings = nightSettings({ night_days: 1, night_start: "00:30", night_end: "06:00" });
  const [night] = nightStats([[at("2026-05-04T01:00:00"), at("2026-05-04T05:00:00")]], settings, at("2026-05-04T12:00:00"));
  assert.deepEqual(night.start, at("2026-05-04T00:30:00"));
  close(night.length, 5.5, "length");
  close(night.asleep, 4, "asleep");
});

test("night across a daylight saving change", () => {
  // Clocks go forward at 02:00 on 2026-03-29 in Copenhagen: 22:00-09:00 is 10 h.
  const settings = nightSettings({ night_days: 1, night_start: "22:00", night_end: "09:00" });
  const [night] = nightStats([[at("2026-03-28T22:00:00"), at("2026-03-29T09:00:00")]], settings, at("2026-03-29T12:00:00"));
  close(night.length, 10, "length");
  close(night.asleep, 10, "asleep");
  close(night.awake, 0, "awake");
});
