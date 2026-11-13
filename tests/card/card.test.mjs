// Browser tests of the card with a mocked hass (no Home Assistant needed).
//   node --test tests/card/
// Set CARD_SHOTS=<dir> to also save screenshots of the layouts.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const HARNESS = new URL("./harness.html", import.meta.url).href;
const CARD = fileURLToPath(new URL("../../custom_components/baby_logger/frontend/baby-logger-card.js", import.meta.url));
const SHOTS = process.env.CARD_SHOTS;
const NOW = "2026-05-05T13:00:00Z"; // 15:00 in Copenhagen

const iso = (time, day = "2026-05-05") =>
  new Date(`${day}T${time.length === 5 ? `${time}:00` : time}+02:00`).toISOString();

function snapshot(overrides = {}) {
  return {
    entry_id: "e1",
    name: "Alex",
    revision: 3,
    now: NOW,
    sleeping: false,
    sleep_start: null,
    last_wake: iso("13:50"),
    settings: { merge_minutes: 45, night_start: "22:00:00", night_end: "09:00:00" },
    undo: null,
    next_side: "right",
    today: {
      diapers: { total: 3, wet: 2, dirty: 1, both: 0 },
      feedings: { total: 2, left: 2, right: 0, bottle: 0 },
      bottle_ml: 0,
      sleep_hours: 9.5,
    },
    last_diaper: { id: "d2", kind: "diaper", start: iso("14:10"), end: null, diaper_type: "wet" },
    last_feeding: {
      id: "f2",
      kind: "feeding",
      start: iso("14:20"),
      end: iso("14:35"),
      sides: [{ side: "left", time: iso("14:20") }],
      side: "left",
      amount_ml: null,
    },
    last_night: { asleep: 8.5, awake: 2.5, wakes: 2, avg_asleep: 8.7 },
    daytime: { asleep: 1.5, naps: 2, done: false, avg_asleep: 3.1 },
    events: [
      { id: "s1", kind: "sleep", start: iso("21:30", "2026-05-04"), end: iso("06:30"), sides: [] },
      { id: "d1", kind: "diaper", start: iso("07:00"), end: null, diaper_type: "dirty" },
      { id: "f1", kind: "feeding", start: iso("08:00"), end: iso("08:20"), sides: [{ side: "left", time: iso("08:00") }], amount_ml: null },
      { id: "s2", kind: "sleep", start: iso("12:20"), end: iso("13:50"), sides: [] },
      { id: "d2", kind: "diaper", start: iso("14:10"), end: null, diaper_type: "wet" },
      { id: "f2", kind: "feeding", start: iso("14:20"), end: iso("14:35"), sides: [{ side: "left", time: iso("14:20") }], amount_ml: null },
    ],
    birth_date: "2026-01-15",
    growth: [
      { id: "g1", date: "2026-01-15", weight_kg: 3.4, length_cm: 50.5, note: null },
      { id: "g2", date: "2026-03-01", weight_kg: 4.9, length_cm: 56, note: null },
      { id: "g3", date: "2026-05-01", weight_kg: 6.1, length_cm: null, note: null },
    ],
    milestones: [
      { key: "head_up_tummy", name: "Holds head up on tummy", category: "movement", months: 2, cdc: true, custom: false, date: "2026-03-10", note: null },
      { key: "crawls", name: "Crawls", category: "movement", months: 9, cdc: false, custom: false, date: null, note: null },
      { key: "first_smile", name: "First social smile", category: "social", months: 2, cdc: true, custom: false, date: "2026-02-20", note: null },
      { key: "custom_abc", name: "First swim", category: "custom", months: null, cdc: false, custom: true, date: "2026-04-02", note: null },
    ],
    ...overrides,
  };
}
const SLEEPS = [
  [iso("21:30", "2026-05-04"), iso("06:30")],
  [iso("12:20"), iso("13:50")],
];

let browser;
before(async () => {
  browser = await chromium.launch();
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
});
after(async () => {
  await browser?.close();
});

/** A page with the card mounted. */
async function mount({ config = {}, snap = snapshot(), width = 420, dark = false } = {}) {
  const context = await browser.newContext({ timezoneId: "Europe/Copenhagen", viewport: { width: width + 32, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.clock.install({ time: new Date(NOW) });
  await page.goto(HARNESS);
  await page.addScriptTag({ path: CARD, type: "module" });
  await page.waitForFunction(() => customElements.get("baby-logger-card"));
  await page.evaluate(
    ({ config, snap, sleeps, width, dark }) => {
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.style.setProperty("--width", `${width}px`);
      const card = document.createElement("baby-logger-card");
      card.setConfig(config);
      document.getElementById("host").appendChild(card);
      window.hass = window.makeHass(snap, sleeps);
      card.hass = window.hass;
    },
    { config, snap, sleeps: SLEEPS, width, dark }
  );
  await page.waitForFunction(() => document.querySelector("baby-logger-card").shadowRoot.querySelector("ha-card > div:not(.message)"));
  await page.waitForTimeout(50);
  return { page, context, errors };
}

/** The rendered parts, in order. */
const partsOf = (page) =>
  page.evaluate(() =>
    [...document.querySelector("baby-logger-card").shadowRoot.querySelector("ha-card").children].map((el) => {
      if (el.classList.contains("section")) {
        const title = el.querySelector(".section-title")?.textContent ?? "";
        if (el.querySelector(".summary")) return "summary";
        if (title.startsWith("Last ")) return "trends";
        if (title === "Night sleep") return "nights";
        if (title.startsWith("Sleep timeline")) return "timeline";
        if (title === "Log") return "log";
      }
      return { header: "header", undo: "undo", tiles: "tiles", quick: "buttons", bottle: "bottle" }[el.className] ?? el.className;
    })
  );
const calls = (page) => page.evaluate(() => window.hass.calls.map((c) => [c.service, c.data]));
const wsTypes = (page) => page.evaluate(() => window.hass.ws.map((m) => m.type));
const shot = async (page, name) => {
  if (SHOTS) await page.locator("baby-logger-card").screenshot({ path: `${SHOTS}/${name}.png` });
};

test("without parts the card looks like before", async () => {
  const { page, context, errors } = await mount({ snap: snapshot({ undo: { action: "diaper", expires: iso("15:00:25") } }) });
  assert.deepEqual(await partsOf(page), ["header", "undo", "tiles", "summary", "trends", "nights", "timeline", "log"]);
  assert.ok((await wsTypes(page)).includes("baby_logger/sleeps"));
  // Growth and milestones are only requested by cards that show them.
  const sub = await page.evaluate(() => window.hass.ws.find((m) => m.type === "baby_logger/subscribe"));
  assert.equal(sub.growth, false);
  assert.equal(sub.milestones, false);
  await shot(page, "legacy");
  assert.deepEqual(errors, []);
  await context.close();
});

test("show_* flags still hide parts when parts is not set", async () => {
  const { page, context } = await mount({ config: { show_trends: false, show_nights: false, show_timeline: false } });
  assert.deepEqual(await partsOf(page), ["header", "tiles", "summary", "log"]);
  // No part needs the sleep history, so it isn't fetched.
  assert.ok(!(await wsTypes(page)).includes("baby_logger/sleeps"));
  await context.close();
});

test("phone layout: quick buttons and summary", async () => {
  const { page, context, errors } = await mount({ config: { parts: ["buttons", "summary"] } });
  assert.deepEqual(await partsOf(page), ["buttons", "summary"]);
  assert.ok(!(await wsTypes(page)).includes("baby_logger/sleeps"));

  const card = page.locator("baby-logger-card");
  const names = await card.locator(".qb .qb-name").allTextContents();
  assert.deepEqual(names, ["Awake ☀️", "Wet", "Dirty", "Both", "Left", "Right", "Bottle"]);
  assert.match(await card.locator(".qb.wide .qb-sub").textContent(), /^Awake for 1h 10m — tap to start sleep$/);
  // The suggested side is highlighted; within the merge window a tap continues the feeding.
  assert.equal(await card.locator('.qb.next[data-value="right"] .badge').textContent(), "next");
  assert.equal(await card.locator('.qb[data-value="left"] .qb-sub').textContent(), "same feeding");
  // Big enough to tap.
  for (const box of await card.locator(".qb").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) {
    assert.ok(box >= 56, `button is ${box}px high`);
  }
  // Three per row: Wet, Dirty and Both share a row.
  const tops = await card.locator('.qb[data-action="diaper"]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  assert.equal(new Set(tops).size, 1);
  await shot(page, "phone-awake");

  await card.locator('.qb[data-value="wet"]').click();
  await card.locator(".qb.wide").click();
  await card.locator('.qb[data-value="bottle"]').click();
  assert.deepEqual(await partsOf(page), ["buttons", "bottle", "summary"]);
  await card.locator("#bottle-amount").fill("90");
  await card.locator('[data-action="bottle-log"]').click();
  assert.deepEqual(await calls(page), [
    ["log_diaper", { config_entry_id: "e1", type: "wet" }],
    ["start_sleep", { config_entry_id: "e1" }],
    ["log_feeding", { config_entry_id: "e1", side: "bottle", amount_ml: 90 }],
  ]);

  // After an action the Undo button shows up (the banner isn't added: it would be a second undo).
  await page.evaluate(
    (snap) => window.hass.push(snap),
    snapshot({ sleeping: true, sleep_start: iso("14:55"), undo: { action: "sleep", expires: iso("15:00:30") } })
  );
  await page.waitForTimeout(20);
  assert.deepEqual(await partsOf(page), ["buttons", "summary"]);
  assert.equal(await card.locator(".qb.wide.on .qb-name").textContent(), "Sleeping 😴");
  assert.match(await card.locator(".qb.wide.on .qb-sub").textContent(), /^Asleep for 0h 05m — tap to wake$/);
  const undo = card.locator('.qb[data-action="undo"]');
  assert.equal(await undo.locator(".qb-name").textContent(), "↩️ Undo");
  assert.equal(await undo.locator(".qb-sub").textContent(), "Fell asleep · tap within 30s");
  await shot(page, "phone-sleeping-undo");
  await undo.click();
  assert.deepEqual((await calls(page)).at(-1), ["undo", { config_entry_id: "e1" }]);
  assert.deepEqual(errors, []);
  await context.close();
});

test("undo banner above the buttons when they have no Undo button", async () => {
  const { page, context } = await mount({
    config: { parts: ["summary", "buttons"], buttons: ["sleep", "diaper_wet", "diaper_dirty"] },
    snap: snapshot({ undo: { action: "diaper", expires: iso("15:00:20") } }),
  });
  assert.deepEqual(await partsOf(page), ["summary", "undo", "buttons"]);
  await page.locator('baby-logger-card .undo [data-action="undo"]').click();
  assert.deepEqual((await calls(page)).at(-1), ["undo", { config_entry_id: "e1" }]);
  await context.close();
});

test("no same-feeding hint outside the merge window", async () => {
  const snap = snapshot({ settings: { merge_minutes: 10, night_start: "22:00:00", night_end: "09:00:00" } });
  const { page, context } = await mount({ config: { parts: ["buttons"] }, snap });
  assert.equal(await page.locator("baby-logger-card .qb .qb-sub").count(), 1); // only the sleep button
  await context.close();
});

test("full layout in the given order", async () => {
  const { page, context, errors } = await mount({
    config: { parts: ["header", "timeline", "buttons", "nights", "trends", "log"] },
    snap: snapshot({ undo: { action: "feeding", expires: iso("15:00:20") } }),
    width: 700,
  });
  assert.deepEqual(await partsOf(page), ["header", "timeline", "buttons", "nights", "trends", "log"]);
  assert.equal(await page.locator('baby-logger-card .qb[data-action="undo"]').count(), 1);
  assert.equal((await wsTypes(page)).filter((t) => t === "baby_logger/sleeps").length, 1);
  await page.waitForTimeout(50);
  await shot(page, "full");
  assert.deepEqual(errors, []);
  await context.close();
});

test("configured buttons", async () => {
  const { page, context } = await mount({
    config: {
      parts: ["buttons"],
      buttons_columns: 2,
      buttons: [
        { action: "feed_left", name: "Boob L", icon: "mdi:numeric-1", color: "#ff00aa" },
        { action: "diaper_both", columns: 12, color: "light-green" },
        "sleep",
      ],
    },
  });
  const card = page.locator("baby-logger-card");
  assert.deepEqual(await card.locator(".qb .qb-name").allTextContents(), ["Boob L", "Both", "Awake ☀️"]);
  const style = await card.locator(".qb").evaluateAll((els) => els.map((e) => e.getAttribute("style").replace(/\s+/g, " ")));
  assert.deepEqual(style, [
    "grid-column: span 6; --accent: #ff00aa",
    "grid-column: span 12; --accent: var(--light-green-color, #8bc34a)",
    "grid-column: span 12; --accent: var(--amber-color, #ffc107)",
  ]);
  assert.equal(await card.locator('.qb[data-value="left"] ha-icon').getAttribute("icon"), "mdi:numeric-1");
  // A wide diaper button lays out like the sleep button.
  assert.equal(await card.locator('.qb.wide[data-value="both"]').count(), 1);
  await context.close();
});

test("dark theme", async () => {
  const { page, context } = await mount({ config: { parts: ["header", "buttons", "summary"] }, dark: true });
  const bg = await page.locator("baby-logger-card .qb").first().evaluate((e) => getComputedStyle(e).backgroundColor);
  assert.notEqual(bg, "rgb(240, 240, 240)"); // follows the theme instead of a fixed colour
  await shot(page, "phone-dark");
  await context.close();
});

test("editor writes parts and buttons", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(HARNESS);
  await page.addScriptTag({ path: CARD, type: "module" });
  await page.waitForFunction(() => customElements.get("baby-logger-card-editor"));
  await page.evaluate(() => {
    const editor = document.createElement("baby-logger-card-editor");
    window.configs = [];
    editor.addEventListener("config-changed", (ev) => {
      window.configs.push(ev.detail.config);
      editor.setConfig(ev.detail.config); // like Home Assistant does
    });
    editor.setConfig({ show_trends: false });
    editor.hass = window.makeHass({ entry_id: "e1", name: "Alex" });
    document.getElementById("host").appendChild(editor);
  });
  const editor = page.locator("baby-logger-card-editor");
  const rows = async (list) =>
    editor.locator(`input[type=checkbox][data-list="${list}"]`).evaluateAll((els) =>
      els.map((e) => `${e.checked ? "+" : "-"}${e.closest(".row").textContent.trim().split("\n")[0].trim()}`)
    );
  const lastConfig = () => page.evaluate(() => window.configs.at(-1));

  // A config without parts shows what the card shows today.
  assert.deepEqual((await rows("parts")).filter((r) => r.startsWith("+")).length, 7);
  assert.ok((await rows("parts")).includes("-Trends"));

  // Move the header down: written as an explicit part list.
  await editor.locator('button[data-list="parts"][data-index="0"][data-op="down"]').click();
  assert.deepEqual((await lastConfig()).parts, ["undo", "header", "tiles", "summary", "nights", "timeline", "log"]);
  assert.equal((await lastConfig()).buttons, undefined);

  // Show the quick buttons and move them to the top.
  const buttonsRow = editor.locator('input[type=checkbox][data-list="parts"]').nth(7);
  await buttonsRow.check();
  for (let i = 7; i > 0; i--) await editor.locator(`button[data-list="parts"][data-index="${i}"][data-op="up"]`).click();
  assert.deepEqual((await lastConfig()).parts.slice(0, 2), ["buttons", "undo"]);

  // Hide the bottle button and rename Wet.
  await editor.locator('input[type=checkbox][data-list="buttons"][data-index="6"]').uncheck();
  await editor.locator('input[data-list="buttons"][data-index="1"][data-field="name"]').fill("Pee");
  await editor.locator('input[data-list="buttons"][data-index="1"][data-field="name"]').press("Tab");
  const config = await lastConfig();
  assert.deepEqual(config.buttons, [
    { action: "sleep" },
    { action: "diaper_wet", name: "Pee" },
    { action: "diaper_dirty" },
    { action: "diaper_both" },
    { action: "feed_left" },
    { action: "feed_right" },
    { action: "undo" },
  ]);
  // Hidden items keep their place while editing.
  assert.ok((await rows("buttons"))[6].startsWith("-Bottle"));

  // Other options also write the part list.
  await page.evaluate(() => {
    const editor = document.querySelector("baby-logger-card-editor");
    editor.setConfig({});
  });
  await editor.locator('input[data-key="log_entries"]').fill("5");
  await editor.locator('input[data-key="log_entries"]').press("Tab");
  assert.deepEqual(await lastConfig(), {
    parts: ["header", "undo", "tiles", "summary", "trends", "nights", "timeline", "log"],
    log_entries: 5,
  });
  await context.close();
});

test("growth: latest values, charts and adding a metric measurement", async () => {
  const { page, context, errors } = await mount({ config: { parts: ["growth"] } });
  const card = page.locator("baby-logger-card");
  assert.deepEqual(await card.locator(".growth-latest .value").allTextContents(), ["6.10 kg", "56.0 cm"]);
  assert.deepEqual(await card.locator(".growth-latest .sub").allTextContents(), [
    "May 1, 2026 · 3 months",
    "Mar 1, 2026 · 6 weeks",
  ]);
  assert.equal(await card.locator("svg.growth-chart").count(), 2);
  assert.equal(await card.locator("svg.growth-chart").first().locator("circle.point").count(), 3);
  assert.equal(await card.locator("svg.growth-chart").nth(1).locator("circle.point").count(), 2);
  // Age along the bottom.
  assert.ok((await card.locator("svg.growth-chart").first().locator("text.axis").allTextContents()).includes("3 m"));
  await shot(page, "growth");

  await card.locator('[data-action="growth-open"]').click();
  assert.equal(await card.locator("#growth-date").inputValue(), "2026-05-05");
  await card.locator("#growth-weight").fill("6.5");
  // Typing survives a re-render (the card updates every minute).
  await page.evaluate((snap) => window.hass.push(snap), snapshot());
  await page.waitForTimeout(20);
  assert.equal(await card.locator("#growth-weight").inputValue(), "6.5");
  await card.locator("#growth-cm").fill("61");
  await card.locator("#growth-cm").press("Enter");
  assert.deepEqual((await calls(page)).at(-1), [
    "log_growth",
    { config_entry_id: "e1", date: "2026-05-05", weight: 6.5, length: 61 },
  ]);
  assert.equal(await card.locator(".form").count(), 0);

  page.once("dialog", (dialog) => dialog.accept());
  await card.locator('[data-action="growth-delete"][data-value="g3"]').click();
  assert.deepEqual((await calls(page)).at(-1), ["delete_growth", { config_entry_id: "e1", event_id: "g3" }]);
  assert.deepEqual(errors, []);
  await context.close();
});

test("growth in imperial units", async () => {
  const { page, context } = await mount({ config: { parts: ["growth"], units: "imperial" } });
  const card = page.locator("baby-logger-card");
  assert.deepEqual(await card.locator(".growth-latest .value").allTextContents(), ["13 lb 7.2 oz", "22.0 in"]);
  assert.equal(await card.locator(".chart-title").first().textContent(), "Weight (lb)");
  await card.locator('[data-action="growth-open"]').click();
  await card.locator("#growth-lb").fill("14");
  await card.locator("#growth-oz").fill("8");
  await card.locator("#growth-in").fill("24.5");
  await card.locator('[data-action="growth-save"]').click();
  // Sent in metric.
  assert.deepEqual((await calls(page)).at(-1), [
    "log_growth",
    { config_entry_id: "e1", date: "2026-05-05", weight: 6.577, length: 62.2 },
  ]);
  await context.close();
});

test("growth without a birth date uses dates", async () => {
  const { page, context } = await mount({ config: { parts: ["growth"] }, snap: snapshot({ birth_date: null }) });
  const card = page.locator("baby-logger-card");
  assert.deepEqual(await card.locator(".growth-latest .sub").allTextContents(), ["May 1, 2026", "Mar 1, 2026"]);
  assert.ok(!(await card.locator("svg.growth-chart text.axis").allTextContents()).includes("3 m"));
  await context.close();
});

test("milestone board", async () => {
  const { page, context, errors } = await mount({ config: { parts: ["milestones"] } });
  const card = page.locator("baby-logger-card");
  assert.equal(await card.locator(".section-title .count").textContent(), "3 of 4 reached");
  assert.deepEqual(await card.locator(".ms-group-title").allTextContents(), ["Movement", "Social", "Your milestones"]);
  assert.equal(await card.locator('.ms.done[data-value="head_up_tummy"] .ms-sub').textContent(), "Mar 10, 2026 · 7 weeks");
  assert.equal(await card.locator('.ms[data-value="crawls"] .ms-sub').textContent(), "Around 9 months");
  assert.equal(await card.locator('.ms[data-value="crawls"].done').count(), 0);
  await shot(page, "milestones");

  // Reach a milestone (today by default, or another date).
  await card.locator('.ms[data-value="crawls"]').click();
  assert.equal(await card.locator("#milestone-date").inputValue(), "2026-05-05");
  await card.locator("#milestone-date").fill("2026-05-01");
  await card.locator('[data-action="milestone-save"]').click();
  assert.deepEqual((await calls(page)).at(-1), [
    "set_milestone",
    { config_entry_id: "e1", milestone: "crawls", date: "2026-05-01" },
  ]);

  // Mark a reached milestone as not reached.
  await card.locator('.ms[data-value="first_smile"]').click();
  assert.equal(await card.locator("#milestone-date").inputValue(), "2026-02-20");
  await card.locator('[data-action="milestone-clear"]').click();
  assert.deepEqual((await calls(page)).at(-1), ["clear_milestone", { config_entry_id: "e1", milestone: "first_smile" }]);

  // Add one of your own.
  await card.locator("#milestone-name").fill("First trip to the beach");
  await card.locator("#milestone-name").press("Enter");
  assert.deepEqual((await calls(page)).at(-1), [
    "add_milestone",
    { config_entry_id: "e1", name: "First trip to the beach", date: "2026-05-05" },
  ]);
  assert.equal(await card.locator("#milestone-name").inputValue(), "");

  // Only your own can be deleted.
  await card.locator('.ms[data-value="head_up_tummy"]').click();
  assert.equal(await card.locator('[data-action="milestone-delete"]').count(), 0);
  await card.locator('.ms[data-value="custom_abc"]').click();
  page.once("dialog", (dialog) => dialog.accept());
  await card.locator('[data-action="milestone-delete"]').click();
  assert.deepEqual((await calls(page)).at(-1), ["delete_milestone", { config_entry_id: "e1", milestone: "custom_abc" }]);
  assert.deepEqual(errors, []);
  await context.close();
});
