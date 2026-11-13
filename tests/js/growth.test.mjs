// Unit tests for the card's growth and milestone helpers.
//   TZ=Europe/Copenhagen node --test tests/js/*.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";

globalThis.HTMLElement = class {};
globalThis.window = globalThis;
globalThis.customElements = { get: () => true, define: () => {} };

const { parseWeight, parseLength, formatWeight, formatLength, formatAge, growthPoints, todayIso } = await import(
  "../../custom_components/baby_logger/frontend/baby-logger-card.js"
);

const close = (actual, expected, digits = 4) =>
  assert.ok(Math.abs(actual - expected) < 10 ** -digits, `${actual} != ${expected}`);

test("weight from the form", () => {
  assert.equal(parseWeight({ weight: "4.25" }, "metric"), 4.25);
  assert.equal(parseWeight({ weight: "4,25" }, "metric"), 4.25);
  assert.equal(parseWeight({ weight: "" }, "metric"), null);
  assert.equal(parseWeight({ weight: "0" }, "metric"), null);
  close(parseWeight({ lb: "10" }, "imperial"), 4.5359237);
  close(parseWeight({ lb: "9", oz: "8" }, "imperial"), 9.5 * 0.45359237);
  close(parseWeight({ oz: "12" }, "imperial"), 0.75 * 0.45359237);
  assert.equal(parseWeight({}, "imperial"), null);
});

test("length from the form", () => {
  assert.equal(parseLength("55.5", "metric"), 55.5);
  close(parseLength("24", "imperial"), 60.96);
  assert.equal(parseLength("", "imperial"), null);
  assert.equal(parseLength("-3", "metric"), null);
});

test("formatting", () => {
  assert.equal(formatWeight(4.25, "metric"), "4.25 kg");
  assert.equal(formatWeight(4.5359237, "imperial"), "10 lb 0 oz");
  assert.equal(formatWeight(9.4 * 0.45359237, "imperial"), "9 lb 6.4 oz");
  // 15.98 oz rounds up to the next pound.
  assert.equal(formatWeight((5 + 15.98 / 16) * 0.45359237, "imperial"), "6 lb 0 oz");
  assert.equal(formatWeight(null, "metric"), "");
  assert.equal(formatLength(55.46, "metric"), "55.5 cm");
  assert.equal(formatLength(60.96, "imperial"), "24.0 in");
  assert.equal(formatLength(undefined, "metric"), "");
});

test("age", () => {
  assert.equal(formatAge("2026-01-15", "2026-01-15"), "at birth");
  assert.equal(formatAge("2026-01-15", "2026-01-16"), "1 day");
  assert.equal(formatAge("2026-01-15", "2026-02-10"), "3 weeks");
  assert.equal(formatAge("2026-01-15", "2026-06-14"), "4 months");
  assert.equal(formatAge("2026-01-15", "2026-06-15"), "5 months");
  assert.equal(formatAge("2026-01-15", "2028-01-15"), "2 years");
  assert.equal(formatAge("2026-01-15", "2029-04-20"), "3 years 3 months");
  assert.equal(formatAge("2026-01-15", "2025-12-01"), "");
  assert.equal(formatAge(null, "2026-01-01"), "");
});

test("chart points", () => {
  const growth = [
    { date: "2026-03-15", weight_kg: 5.0, length_cm: null },
    { date: "2026-01-15", weight_kg: 3.5, length_cm: 50 },
  ];
  const byAge = growthPoints(growth, "weight_kg", "2026-01-15", "metric");
  assert.deepEqual(
    byAge.map((p) => [p.date, p.y]),
    [
      ["2026-01-15", 3.5],
      ["2026-03-15", 5.0],
    ]
  );
  close(byAge[0].x, 0);
  close(byAge[1].x, 59 / 30.4375);
  // Only measurements that have the value, in display units.
  const length = growthPoints(growth, "length_cm", null, "imperial");
  assert.equal(length.length, 1);
  close(length[0].y, 50 / 2.54);
});

test("today", () => {
  assert.equal(todayIso(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
});
