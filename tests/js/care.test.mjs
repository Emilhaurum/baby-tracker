// Unit tests for the card's medicine & care helpers.
//   TZ=Europe/Copenhagen node --test tests/js/*.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";

globalThis.HTMLElement = class {};
globalThis.window = globalThis;
globalThis.customElements = { get: () => true, define: () => {} };

const {
  careTypeInfo,
  careEntryText,
  formatTemperature,
  careChartKeys,
  defaultCareCharts,
  careChart,
  careDaily,
  treatmentStatus,
  localDateTime,
  setLanguage,
} = await import("../../custom_components/baby_logger/frontend/baby-logger-card.js");

const TYPES = [
  { id: "type_bath", name: "Bath", emoji: "🛁", unit: null, deleted: false },
  { id: "type_pump", name: "Pumping", emoji: "🍼", unit: "ml", deleted: false },
];
const entry = (care_type, extra = {}) => ({ id: "x", kind: "care", start: "2026-05-05T08:00:00+02:00", end: null, care_type, text: null, value: null, ...extra });

test("entry types and log texts", () => {
  setLanguage("en");
  assert.deepEqual(careTypeInfo("temperature"), { emoji: "🌡️", name: "Temperature", unit: "°C", builtin: true });
  assert.deepEqual(careTypeInfo("type_pump", TYPES), { emoji: "🍼", name: "Pumping", unit: "ml", builtin: false });
  // A deleted or unknown type still shows something.
  assert.equal(careTypeInfo("type_gone", TYPES).emoji, "⭐");
  assert.deepEqual(careEntryText(entry("medicine", { text: "Paracetamol 120 mg" })), { emoji: "💊", text: "Paracetamol 120 mg" });
  assert.deepEqual(careEntryText(entry("temperature", { value: 38.44 })), { emoji: "🌡️", text: "Temperature 38.4 °C" });
  assert.equal(careEntryText(entry("temperature", { value: 38.5 }), [], "imperial").text, "Temperature 101.3 °F");
  assert.equal(careEntryText(entry("note")).text, "Note");
  assert.equal(careEntryText(entry("type_bath"), TYPES).text, "Bath");
  assert.equal(careEntryText(entry("type_pump", { value: 120.5, text: "left" }), TYPES).text, "Pumping · left · 120.5 ml");
  setLanguage("da");
  assert.equal(careEntryText(entry("temperature", { value: 38.44 })).text, "Temperatur 38,4 °C");
  assert.equal(careEntryText(entry("type_pump", { value: 120.5 }), TYPES).text, "Pumping · 120,5 ml");
  setLanguage("en");
});

test("temperatures", () => {
  assert.equal(formatTemperature(37, "metric"), "37.0 °C");
  assert.equal(formatTemperature(37, "imperial"), "98.6 °F");
  assert.equal(formatTemperature(null, "metric"), "–");
});

test("chart keys", () => {
  assert.deepEqual(careChartKeys("temperature, medicine ,, bath"), ["temperature", "medicine", "bath"]);
  assert.deepEqual(careChartKeys(["temperature", " x "]), ["temperature", "x"]);
  assert.deepEqual(careChartKeys(undefined), []);
  assert.deepEqual(defaultCareCharts([entry("medicine", { text: "x" })]), ["medicine"]);
  assert.deepEqual(defaultCareCharts([entry("temperature", { value: 37 }), entry("medicine", { text: "x" })]), ["temperature", "medicine"]);
  assert.deepEqual(defaultCareCharts([{ kind: "diaper" }]), []);
});

test("what a chart shows", () => {
  setLanguage("en");
  const temp = careChart("Temperatur", TYPES);
  assert.equal(temp.kind, "line");
  assert.ok(temp.temperature);
  assert.ok(temp.match(entry("temperature")));
  assert.equal(careChart("medicin", TYPES).kind, "bars");
  assert.equal(careChart("none", TYPES), null);
  const pump = careChart("pumping", TYPES);
  assert.deepEqual([pump.kind, pump.unit, pump.label], ["line", "ml", "🍼 Pumping"]);
  const bath = careChart("type_bath", TYPES);
  assert.deepEqual([bath.kind, bath.label], ["bars", "🛁 Bath"]);
  // Anything else: the medicine entries that mention it.
  const para = careChart("Paracetamol", TYPES);
  assert.ok(para.match(entry("medicine", { text: "paracetamol 120 mg" })));
  assert.ok(!para.match(entry("medicine", { text: "Ibuprofen" })));
  assert.ok(!para.match(entry("note", { text: "paracetamol" })));
});

test("entries per day", () => {
  const now = new Date("2026-05-05T15:00:00+02:00");
  const events = [
    entry("medicine", { start: "2026-05-05T08:00:00+02:00" }),
    entry("medicine", { start: "2026-05-05T00:10:00+02:00" }),
    entry("medicine", { start: "2026-05-04T23:50:00+02:00" }),
    entry("medicine", { start: "2026-04-20T08:00:00+02:00" }), // before the range
    entry("note", { start: "2026-05-05T08:00:00+02:00" }),
    { kind: "diaper", start: "2026-05-05T08:00:00+02:00" },
  ];
  const buckets = careDaily(events, (e) => e.care_type === "medicine", 3, now);
  assert.deepEqual(buckets.map((b) => b.n), [0, 1, 2]);
  assert.equal(buckets[0].start.getDate(), 3);
  // Across the change to summer time (29 March in Denmark) days stay whole.
  const dst = careDaily([entry("medicine", { start: "2026-03-29T12:00:00+02:00" })], () => true, 3, new Date("2026-03-30T12:00:00+02:00"));
  assert.deepEqual(dst.map((b) => b.n), [0, 1, 0]);
});

test("treatment status", () => {
  const tr = {
    start: "2026-05-02T19:00:00+02:00",
    end: "2026-05-07T19:00:00+02:00",
    last_dose: "2026-05-05T08:10:00+02:00",
    next_dose: "2026-05-05T14:10:00+02:00",
  };
  const st = treatmentStatus(tr, new Date("2026-05-05T15:00:00+02:00"));
  assert.equal(st.due, true);
  assert.equal(st.day, 3);
  assert.equal(st.totalDays, 5);
  assert.ok(Math.abs(st.progress - (68 / 120)) < 1e-9);
  assert.equal(treatmentStatus(tr, new Date("2026-05-05T14:00:00+02:00")).due, false);
  // Not started yet.
  const later = treatmentStatus({ ...tr, start: "2026-05-06T08:00:00+02:00", next_dose: "2026-05-06T08:00:00+02:00" }, new Date("2026-05-05T15:00:00+02:00"));
  assert.deepEqual([later.started, later.due], [false, false]);
  // As needed, until stopped.
  const asNeeded = treatmentStatus({ start: tr.start, end: null, last_dose: null, next_dose: null }, new Date("2026-05-05T15:00:00+02:00"));
  assert.deepEqual([asNeeded.due, asNeeded.totalDays, asNeeded.progress, asNeeded.day], [false, null, null, 3]);
});

test("local date-time for inputs", () => {
  assert.equal(localDateTime(new Date("2026-05-05T08:07:00+02:00")), "2026-05-05T08:07");
});
