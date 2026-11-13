// Unit tests for the card's configurable parts and quick buttons.
//   TZ=Europe/Copenhagen node --test tests/js/*.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";

globalThis.HTMLElement = class {};
globalThis.window = globalThis;
globalThis.customElements = { get: () => true, define: () => {} };

const { resolveParts, buttonList, resolveColor } = await import(
  "../../custom_components/baby_logger/frontend/baby-logger-card.js"
);

test("without parts the card shows what it always did", () => {
  assert.deepEqual(resolveParts({}), ["header", "undo", "tiles", "summary", "trends", "nights", "timeline", "log"]);
  assert.deepEqual(resolveParts({ show_trends: false, show_timeline: false }), [
    "header",
    "undo",
    "tiles",
    "summary",
    "nights",
    "log",
  ]);
  assert.deepEqual(
    resolveParts({ show_summary: false, show_trends: false, show_nights: false, show_timeline: false, show_log: false }),
    ["header", "undo", "tiles"]
  );
});

test("parts are shown in the given order and the show_* flags are ignored", () => {
  assert.deepEqual(resolveParts({ parts: ["log", "header", "undo", "tiles"], show_log: false }), [
    "log",
    "header",
    "undo",
    "tiles",
  ]);
  // Unknown and repeated names are dropped.
  assert.deepEqual(resolveParts({ parts: ["summary", "nope", "summary", " trends "] }), ["summary", "trends"]);
});

test("the undo banner goes above the first part with buttons when not listed", () => {
  assert.deepEqual(resolveParts({ parts: ["summary", "buttons", "tiles"] }), ["summary", "undo", "buttons", "tiles"]);
  assert.deepEqual(resolveParts({ parts: ["header", "tiles", "buttons"] }), ["header", "undo", "tiles", "buttons"]);
  // Deleting a log entry can be undone too.
  assert.deepEqual(resolveParts({ parts: ["timeline", "log"] }), ["timeline", "undo", "log"]);
  // Nothing to undo from.
  assert.deepEqual(resolveParts({ parts: ["summary", "trends"] }), ["summary", "trends"]);
  // An explicit position is kept.
  assert.deepEqual(resolveParts({ parts: ["buttons", "summary", "undo"] }), ["buttons", "summary", "undo"]);
});

test("default quick buttons", () => {
  const buttons = buttonList({});
  assert.deepEqual(
    buttons.map((b) => b.action),
    ["sleep", "diaper_wet", "diaper_dirty", "diaper_both", "feed_left", "feed_right", "feed_bottle", "undo"]
  );
  assert.deepEqual(
    buttons.map((b) => b.columns),
    [12, 4, 4, 4, 4, 4, 4, 12]
  );
  assert.equal(buttons[1].name, null);
});

test("configured quick buttons", () => {
  const buttons = buttonList({
    buttons_columns: 2,
    buttons: [
      "feed_left",
      { action: "diaper_wet", name: "Pee", icon: "mdi:water-outline", color: "light-blue", columns: 3 },
      { action: "sleep", columns: 99 },
      { action: "nope" },
      { action: "feed_left" },
      null,
    ],
  });
  assert.deepEqual(
    buttons.map((b) => [b.action, b.columns]),
    [
      ["feed_left", 6],
      ["diaper_wet", 3],
      ["sleep", 12],
    ]
  );
  assert.deepEqual(
    { name: buttons[1].name, icon: buttons[1].icon, color: buttons[1].color },
    { name: "Pee", icon: "mdi:water-outline", color: "light-blue" }
  );
  assert.deepEqual(buttonList({ buttons: [] }), []);
});

test("colours", () => {
  assert.equal(resolveColor("blue"), "var(--blue-color, #2196f3)");
  assert.equal(resolveColor("Light_Blue"), "var(--light-blue-color, #03a9f4)");
  assert.equal(resolveColor("primary"), "var(--primary-color)");
  assert.equal(resolveColor("#ff00aa"), "#ff00aa");
  assert.equal(resolveColor("rgb(10, 20, 30)"), "rgb(10, 20, 30)");
  assert.equal(resolveColor(""), "var(--primary-color)");
  // Values that could break out of the style attribute are not used.
  assert.equal(resolveColor('red;" onclick="x'), "var(--primary-color)");
  assert.equal(resolveColor("red; background: url(x)", "grey"), "grey");
});
