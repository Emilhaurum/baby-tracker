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
      { key: "head_up_tummy", name: "Holds head up on tummy", category: "movement", months: 2, cdc: true, tags: ["head", "tummy time"], custom: false, date: "2026-03-10", note: null },
      { key: "crawls", name: "Crawls", category: "movement", months: 9, cdc: false, tags: ["crawl", "crawling"], i18n: { da: { name: "Kravler", tags: ["kravle", "kravler"] } }, custom: false, date: null, note: null },
      { key: "first_smile", name: "First social smile", category: "social", months: 2, cdc: true, tags: ["smile"], custom: false, date: "2026-02-20", note: "At grandma's" },
      { key: "custom_abc", name: "First swim", category: "custom", months: null, cdc: false, tags: [], custom: true, date: "2026-04-02", note: null },
      { key: "rolls_tummy_to_back", name: "Rolls from tummy to back", category: "movement", months: 6, cdc: true, tags: ["roll", "rolling", "rolls over", "turns over"], custom: false, date: null, note: null },
      { key: "sits_without_support", name: "Sits without support", category: "movement", months: 9, cdc: true, tags: ["sit", "sitting"], custom: false, date: null, note: null },
      { key: "first_steps", name: "First steps on their own", category: "movement", months: 12, cdc: false, tags: ["walk", "walking", "steps"], custom: false, date: null, note: null },
      { key: "first_tooth", name: "First tooth", category: "firsts", months: 6, cdc: false, tags: ["tooth", "teeth", "teething"], i18n: { da: { name: "Første tand", tags: ["tand", "tænder"] } }, custom: false, date: null, note: null },
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
async function mount({ config = {}, snap = snapshot(), width = 420, dark = false, language = "en" } = {}) {
  const context = await browser.newContext({ timezoneId: "Europe/Copenhagen", viewport: { width: width + 32, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.clock.install({ time: new Date(NOW) });
  await page.goto(HARNESS);
  await page.addScriptTag({ path: CARD, type: "module" });
  await page.waitForFunction(() => customElements.get("baby-logger-card"));
  await page.evaluate(
    ({ config, snap, sleeps, width, dark, language }) => {
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.style.setProperty("--width", `${width}px`);
      const card = document.createElement("baby-logger-card");
      card.setConfig(config);
      document.getElementById("host").appendChild(card);
      window.hass = window.makeHass(snap, sleeps);
      window.hass.locale = { language };
      card.hass = window.hass;
    },
    { config, snap, sleeps: SLEEPS, width, dark, language }
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
  // The amount survives an update after the field lost focus (the card is rebuilt).
  await card.locator("#bottle-amount").blur();
  await page.evaluate((snap) => window.hass.push(snap), snapshot());
  await page.waitForTimeout(20);
  assert.equal(await card.locator("#bottle-amount").inputValue(), "90");
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

test("wider cards get two and three columns from their width", async () => {
  for (const [width, classes, columns] of [
    [420, [], 1],
    [520, ["w420"], 2],
    [760, ["w420", "w700"], 3],
  ]) {
    const { page, context } = await mount({ width });
    const result = await page.evaluate(() => {
      const card = document.querySelector("baby-logger-card").shadowRoot.querySelector("ha-card");
      const tiles = card.querySelector(".tiles");
      return { classes: [...card.classList].sort(), columns: getComputedStyle(tiles).gridTemplateColumns.split(" ").length };
    });
    assert.deepEqual(result, { classes, columns }, `width ${width}`);
    await context.close();
  }
});

test("Danish, following the Home Assistant user's language", async () => {
  const { page, context, errors } = await mount({ language: "da", config: { parts: ["header", "tiles", "summary", "log", "growth", "milestones"] } });
  const card = page.locator("baby-logger-card");
  const text = (sel) => card.locator(sel).first().textContent();
  assert.deepEqual(await card.locator(".chip").allTextContents(), ["3 bleer", "2 måltider"]);
  assert.deepEqual((await card.locator(".tile-head").allTextContents()).map((s) => s.trim()), ["Ble", "Måltid", "Vågen"]);
  assert.ok((await text(".tile .sub")).includes("Våd kl."), await text(".tile .sub"));
  assert.ok((await text(".summary .sub")).includes("opvågninger · gns."), await text(".summary .sub"));
  const titles = (await card.locator(".section-title").allTextContents()).map((s) => s.trim().split(/\s{2,}/)[0]);
  assert.deepEqual(titles.slice(0, 2), ["Log", "Vækst"]);
  assert.ok((await card.locator(".log").textContent()).includes("Ble: Våd"));
  // Numbers with a decimal comma, dates in Danish.
  assert.equal((await card.locator(".growth-latest .value").first().textContent()).trim(), "6,10 kg");
  assert.ok((await card.locator(".growth-latest .sub").first().textContent()).includes("maj 2026"));
  // Built-in milestones in Danish; your own keep their name.
  assert.ok((await card.locator(".ms-head").textContent()).includes("Milepæle"));
  assert.equal(await card.locator('.ms[data-key="crawls"] .ms-name').textContent(), "Kravler");
  assert.equal(await card.locator('.ms[data-key="custom_abc"] .ms-name').textContent(), "First swim");
  assert.equal(await card.locator('.ms[data-key="crawls"] .ms-when').textContent(), "Omkring 9 måneder");
  // The add window searches Danish words.
  await card.locator('[data-action="milestone-add-open"]').click();
  const dialog = card.locator("dialog.ms-dialog");
  assert.ok((await dialog.locator(".dlg-title").textContent()).includes("Tilføj milepæl"));
  await dialog.locator("#ms-add-query").fill("tænder");
  assert.deepEqual(await dialog.locator(".suggestion .ms-name").allTextContents(), ["Første tand"]);
  await dialog.locator('[data-action="add-cancel"]').click();
  await shot(page, "danish");
  assert.deepEqual(errors, []);
  await context.close();
});

test("a card rebuilt in Danish shows Danish straight away", async () => {
  const { page, context } = await mount({ language: "da", config: { parts: ["header", "tiles"] } });
  // Home Assistant builds the card again and attaches it before giving it hass.
  const chips = await page.evaluate(() => {
    const old = document.querySelector("baby-logger-card");
    const card = document.createElement("baby-logger-card");
    card.setConfig({ parts: ["header", "tiles"] });
    old.replaceWith(card);
    return [...card.shadowRoot.querySelectorAll(".chip")].map((c) => c.textContent);
  });
  assert.deepEqual(chips, ["3 bleer", "2 måltider"]);
  await context.close();
});

test("the language option overrides Home Assistant's", async () => {
  const { page, context } = await mount({ language: "da", config: { language: "en", parts: ["header"] } });
  assert.deepEqual(await page.locator("baby-logger-card").locator(".chip").allTextContents(), ["3 diapers", "2 feedings"]);
  await context.close();
  const other = await mount({ language: "en", config: { language: "da", parts: ["header"] } });
  assert.deepEqual(await other.page.locator("baby-logger-card").locator(".chip").allTextContents(), ["3 bleer", "2 måltider"]);
  await other.context.close();
});

/** A snapshot with `n` diapers, one every 30 minutes going back from 14:30. */
function manyEntries(n) {
  const events = Array.from({ length: n }, (_, i) => {
    const at = new Date(new Date(iso("14:30")).getTime() - i * 30 * 60000).toISOString();
    return { id: `d${i}`, kind: "diaper", start: at, end: null, diaper_type: i % 2 ? "dirty" : "wet" };
  });
  return snapshot({ events });
}

test("without log_visible the log doesn't scroll and shows 10 entries", async () => {
  const { page, context, errors } = await mount({ config: { parts: ["log"] }, snap: manyEntries(30) });
  const card = page.locator("baby-logger-card");
  assert.equal(await card.locator("ul.log li:not(.day)").count(), 10);
  assert.equal(await card.locator("ul.log-scroll").count(), 0);
  const list = card.locator("ul.log");
  assert.equal(await list.evaluate((ul) => ul.style.maxHeight), "");
  assert.equal(await list.evaluate((ul) => getComputedStyle(ul).overflowY), "visible");
  assert.deepEqual(errors, []);
  await context.close();
});

test("the log shows log_visible entries and scrolls to the rest", async () => {
  const { page, context, errors } = await mount({ config: { parts: ["log"], log_visible: 6 }, snap: manyEntries(30) });
  const list = page.locator("baby-logger-card").locator("ul.log-scroll");
  // 20 entries by default, 6 of them visible (with the day headings between them).
  assert.equal(await list.locator("li:not(.day)").count(), 20);
  const sizes = () =>
    list.evaluate((ul) => {
      const top = ul.getBoundingClientRect().top;
      const entries = [...ul.querySelectorAll(":scope > li:not(.day)")];
      return {
        client: ul.clientHeight,
        scroll: ul.scrollHeight,
        sixth: Math.ceil(entries[5].getBoundingClientRect().bottom - top),
        overflow: getComputedStyle(ul).overflowY,
      };
    });
  let size = await sizes();
  assert.ok(Math.abs(size.client - size.sixth) <= 2, JSON.stringify(size));
  assert.ok(size.scroll > size.client + 100, JSON.stringify(size));
  assert.equal(size.overflow, "auto");
  // Faded at the bottom until scrolled to the end.
  assert.equal(await list.evaluate((ul) => ul.classList.contains("at-end")), false);
  await shot(page, "log-scroll");
  await list.evaluate((ul) => {
    ul.scrollTop = ul.scrollHeight;
    ul.dispatchEvent(new Event("scroll"));
  });
  assert.equal(await list.evaluate((ul) => ul.classList.contains("at-end")), true);

  // Scrolled down, the list stays there when the card is updated.
  await list.evaluate((ul) => (ul.scrollTop = 200));
  // Wait for the rebuilt list (not a fixed time) and past the "someone is scrolling" pause.
  await page.waitForTimeout(900);
  await page.evaluate(() => (window.oldList = document.querySelector("baby-logger-card").shadowRoot.querySelector("ul.log-scroll")));
  await page.evaluate((snap) => window.hass.push(snap), manyEntries(30));
  await page.waitForFunction(() => document.querySelector("baby-logger-card").shadowRoot.querySelector("ul.log-scroll") !== window.oldList);
  assert.equal(await list.evaluate((ul) => ul.scrollTop), 200);
  assert.deepEqual(errors, []);
  await context.close();
});

test("a scrolled log keeps its size and the entry you're reading", async () => {
  const { page, context, errors } = await mount({ config: { parts: ["header", "undo", "log"], log_visible: 6 }, snap: manyEntries(30) });
  const list = page.locator("baby-logger-card").locator("ul.log-scroll");
  const height = await list.evaluate((ul) => ul.clientHeight);
  // Scroll so "d5" is the first entry shown.
  await list.evaluate((ul) => {
    const li = ul.querySelector('li[data-id="d5"]');
    ul.scrollTop += li.getBoundingClientRect().top - ul.getBoundingClientRect().top;
  });
  const firstShown = () =>
    list.evaluate((ul) => {
      const top = ul.getBoundingClientRect().top;
      const li = [...ul.querySelectorAll("li[data-id]")].find((x) => x.getBoundingClientRect().bottom > top + 1);
      return { id: li.dataset.id, offset: Math.round(li.getBoundingClientRect().top - top) };
    });
  const before = await firstShown();
  await page.waitForTimeout(900); // done scrolling
  // The card gets taller above the log (undo banner) and a new entry arrives at the top.
  const snap = manyEntries(30);
  snap.events.unshift({ id: "new", kind: "diaper", start: iso("14:55"), end: null, diaper_type: "both" });
  snap.undo = { action: "diaper", expires: iso("15:00:25") };
  await page.evaluate((s) => window.hass.push(s), snap);
  await page.waitForFunction(() => document.querySelector("baby-logger-card").shadowRoot.querySelector('li[data-id="new"]'));
  await page.waitForTimeout(50);
  assert.equal(await list.evaluate((ul) => ul.clientHeight), height);
  assert.deepEqual(await firstShown(), before);
  // The card's width changes: still the same entries shown.
  await page.evaluate(() => document.documentElement.style.setProperty("--width", "360px"));
  await page.waitForTimeout(100);
  assert.equal((await firstShown()).id, before.id);
  assert.deepEqual(errors, []);
  await context.close();
});

test("the log isn't rebuilt while it is being scrolled", async () => {
  const { page, context } = await mount({ config: { parts: ["header", "log"], log_visible: 6 }, snap: manyEntries(30) });
  await page.evaluate(() => {
    const ul = document.querySelector("baby-logger-card").shadowRoot.querySelector("ul.log-scroll");
    window.oldList = ul;
    ul.scrollTop = 120;
  });
  await page.waitForTimeout(50);
  const snap = manyEntries(30);
  snap.today = { ...snap.today, diapers: { ...snap.today.diapers, total: 7 } };
  await page.evaluate((s) => window.hass.push(s), snap);
  await page.waitForTimeout(50);
  // The rest of the card is updated, the log isn't (yet).
  assert.equal(await page.evaluate(() => document.querySelector("baby-logger-card").shadowRoot.querySelector(".chip").textContent), "7 diapers");
  assert.equal(await page.evaluate(() => document.querySelector("baby-logger-card").shadowRoot.querySelector("ul.log-scroll") === window.oldList), true);
  // Once the scrolling has stopped it is, at the same place.
  await page.waitForFunction(() => document.querySelector("baby-logger-card").shadowRoot.querySelector("ul.log-scroll") !== window.oldList, null, { timeout: 3000 });
  assert.equal(await page.evaluate(() => document.querySelector("baby-logger-card").shadowRoot.querySelector("ul.log-scroll").scrollTop), 120);
  await context.close();
});

test("log_visible and log_entries can be changed; short logs don't scroll", async () => {
  let { page, context } = await mount({ config: { parts: ["log"], log_visible: 3, log_entries: 8 }, snap: manyEntries(30) });
  let list = page.locator("baby-logger-card").locator("ul.log-scroll");
  assert.equal(await list.locator("li:not(.day)").count(), 8);
  const third = await list.evaluate((ul) => Math.ceil(ul.querySelectorAll(":scope > li:not(.day)")[2].getBoundingClientRect().bottom - ul.getBoundingClientRect().top));
  assert.ok(Math.abs((await list.evaluate((ul) => ul.clientHeight)) - third) <= 2);
  await context.close();
  // 0 (or nonsense) means the default: log_entries 20 when scrolling ...
  ({ page, context } = await mount({ config: { parts: ["log"], log_entries: 0, log_visible: 6 }, snap: manyEntries(30) }));
  list = page.locator("baby-logger-card").locator("ul.log-scroll");
  assert.equal(await list.locator("li:not(.day)").count(), 20);
  const sixth = await list.evaluate((ul) => Math.ceil(ul.querySelectorAll(":scope > li:not(.day)")[5].getBoundingClientRect().bottom - ul.getBoundingClientRect().top));
  assert.ok(Math.abs((await list.evaluate((ul) => ul.clientHeight)) - sixth) <= 2);
  await context.close();
  // ... and log_visible 0 is no scrolling.
  ({ page, context } = await mount({ config: { parts: ["log"], log_visible: 0 }, snap: manyEntries(30) }));
  assert.equal(await page.locator("baby-logger-card").locator("ul.log-scroll").count(), 0);
  assert.equal(await page.locator("baby-logger-card").locator("ul.log li:not(.day)").count(), 10);
  await context.close();
  ({ page, context } = await mount({ config: { parts: ["log"], log_visible: 6 }, snap: manyEntries(4) }));
  list = page.locator("baby-logger-card").locator("ul.log-scroll");
  assert.equal(await list.evaluate((ul) => ul.classList.contains("scrolls")), false);
  assert.equal(await list.evaluate((ul) => ul.style.maxHeight), "");
  await context.close();
});

test("tapping the sleep timeline shows a period and its length", async () => {
  // Without timeline_details the timeline can't be tapped.
  let { page, context, errors } = await mount({ config: { parts: ["timeline"] } });
  let card = page.locator("baby-logger-card");
  let today = card.locator(".tl-row:not(.tl-axis)").first();
  const tapAt = async (row, hours) => {
    const box = await row.locator(".tl-bar").boundingBox();
    await page.mouse.click(box.x + (box.width * hours) / 24, box.y + box.height / 2);
  };
  assert.equal(await card.locator('[data-action="timeline-pick"]').count(), 0);
  await tapAt(today, 3);
  assert.equal(await card.locator(".tl-detail").count(), 0);
  await context.close();

  ({ page, context, errors } = await mount({ config: { parts: ["timeline"], timeline_details: true } }));
  card = page.locator("baby-logger-card");
  today = card.locator(".tl-row:not(.tl-axis)").first();
  // Tap today's line at 03:00 (the night's sleep, 21:30-06:30) and at 09:00 (awake).
  await tapAt(today, 3);
  const detail = card.locator(".tl-detail");
  assert.equal(await detail.count(), 1);
  assert.match(await detail.textContent(), /Asleep .*9h 00m/);
  assert.ok(await detail.evaluate((d) => d.classList.contains("sleep")));
  assert.equal(await card.locator(".tl-seg").count(), 1);
  await shot(page, "timeline-pick");
  // It stays across updates.
  await page.evaluate((snap) => window.hass.push(snap), snapshot());
  await page.waitForTimeout(30);
  assert.equal(await card.locator(".tl-detail").count(), 1);
  // Another place shows the awake period instead.
  await tapAt(today, 9);
  assert.match(await card.locator(".tl-detail").textContent(), /Awake .*5h 50m/);
  // Tapping the same period elsewhere closes it ...
  await tapAt(today, 12.1);
  assert.equal(await card.locator(".tl-detail").count(), 0);
  // ... but a nap right next to the period shown (12:20-13:50) is shown, not a close.
  await tapAt(today, 12.1);
  assert.match(await card.locator(".tl-detail").textContent(), /Awake /);
  await tapAt(today, 12.45);
  assert.match(await card.locator(".tl-detail").textContent(), /Asleep .*1h 30m/);
  // The same period again, or the close button, closes it.
  await tapAt(today, 13);
  assert.equal(await card.locator(".tl-detail").count(), 0);
  await tapAt(today, 9);
  await card.locator('[data-action="timeline-close"]').click();
  assert.equal(await card.locator(".tl-detail").count(), 0);
  // Later today hasn't happened: nothing to show, now or later.
  await tapAt(today, 20);
  assert.equal(await card.locator(".tl-detail").count(), 0);
  await page.clock.fastForward("06:00:00");
  await page.evaluate((snap) => window.hass.push(snap), snapshot());
  await page.waitForTimeout(30);
  assert.equal(await card.locator(".tl-detail").count(), 0);
  // Taps on the date or the hours aren't taps on the line.
  await today.locator(".tl-label").click();
  await today.locator(".tl-value").click();
  assert.equal(await card.locator(".tl-detail").count(), 0);
  // Switching to another baby closes it.
  await tapAt(today, 3);
  assert.equal(await card.locator(".tl-detail").count(), 1);
  await page.evaluate(() => document.querySelector("baby-logger-card").setConfig({ parts: ["timeline"], timeline_details: true, entry_id: "e1" }));
  await card.locator(".tl-row:not(.tl-axis)").first().waitFor();
  assert.equal(await card.locator(".tl-detail").count(), 0);
  assert.deepEqual(errors, []);
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
  // The opt-in options: on writes them, off removes them again.
  await editor.locator('input[data-key="timeline_details"]').check();
  assert.equal((await lastConfig()).timeline_details, true);
  await editor.locator('input[data-key="timeline_details"]').uncheck();
  assert.equal("timeline_details" in (await lastConfig()), false);
  await editor.locator('input[data-key="log_visible"]').fill("6");
  await editor.locator('input[data-key="log_visible"]').press("Tab");
  assert.equal((await lastConfig()).log_visible, 6);
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

  // The measurement list starts collapsed.
  assert.equal(await card.locator(".growth-list").count(), 0);
  assert.equal((await card.locator('[data-action="growth-list"]').textContent()).replace(/\s+/g, " ").trim(), "Measurements3");
  await card.locator('[data-action="growth-list"]').click();
  assert.equal(await card.locator(".growth-list li").count(), 3);
  // It stays open across updates.
  await page.evaluate((snap) => window.hass.push(snap), snapshot());
  await page.waitForTimeout(20);
  assert.equal(await card.locator(".growth-list li").count(), 3);
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

test("growth list can start expanded", async () => {
  const { page, context } = await mount({ config: { parts: ["growth"], growth_list: "expanded", growth_entries: 2 } });
  const card = page.locator("baby-logger-card");
  assert.equal(await card.locator(".growth-list li").count(), 2);
  await card.locator('[data-action="growth-list"]').click();
  assert.equal(await card.locator(".growth-list").count(), 0);
  await context.close();
});

test("growth without a birth date uses dates", async () => {
  const { page, context } = await mount({ config: { parts: ["growth"] }, snap: snapshot({ birth_date: null }) });
  const card = page.locator("baby-logger-card");
  assert.deepEqual(await card.locator(".growth-latest .sub").allTextContents(), ["May 1, 2026", "Mar 1, 2026"]);
  assert.ok(!(await card.locator("svg.growth-chart text.axis").allTextContents()).includes("3 m"));
  await context.close();
});

test("milestone timeline", async () => {
  const { page, context, errors } = await mount({ config: { parts: ["milestones"] } });
  const card = page.locator("baby-logger-card");
  const names = () => card.locator(".ms .ms-name").allTextContents();
  // No "x of y reached" count.
  assert.equal(await card.locator(".count").count(), 0);
  assert.equal((await card.locator(".section-title").textContent()).includes("reached"), false);
  // Reached ones by date, then the next few by typical age.
  assert.deepEqual(await card.locator(".ms-label").allTextContents(), ["Reached", "Up next"]);
  assert.deepEqual(await names(), [
    "First social smile",
    "Holds head up on tummy",
    "First swim",
    "Rolls from tummy to back",
    "First tooth",
    "Crawls",
    "Sits without support",
  ]);
  assert.equal(await card.locator('.ms[data-key="head_up_tummy"] .ms-when').textContent(), "Mar 10, 2026 · 7 weeks");
  assert.equal(await card.locator('.ms[data-key="crawls"] .ms-when').textContent(), "Around 9 months");
  // Collapsed: no details until tapped.
  assert.equal(await card.locator(".ms-details").count(), 0);
  await shot(page, "milestones");

  // Show the rest of the upcoming ones.
  await card.locator('[data-action="milestones-more"]').click();
  assert.equal((await names()).at(-1), "First steps on their own");
  await card.locator('[data-action="milestones-more"]').click();
  assert.equal((await names()).length, 7);

  // Expand one: details, and reach it (today by default, or another date).
  await card.locator('.ms-row[data-value="crawls"]').click();
  assert.equal(await card.locator(".ms-details").count(), 1);
  assert.ok((await card.locator('.ms[data-key="crawls"] .ms-details').textContent()).includes("Typically around 9 months"));
  assert.equal(await card.locator("#ms-date-crawls").inputValue(), "2026-05-05");
  await card.locator("#ms-date-crawls").fill("2026-05-01");
  // Picking a date survives an update.
  await page.evaluate((snap) => window.hass.push(snap), snapshot());
  await page.waitForTimeout(20);
  assert.equal(await card.locator("#ms-date-crawls").inputValue(), "2026-05-01");
  await card.locator('.ms[data-key="crawls"] [data-action="milestone-save"]').click();
  assert.deepEqual((await calls(page)).at(-1), ["set_milestone", { config_entry_id: "e1", milestone: "crawls", date: "2026-05-01" }]);
  // Tap again to collapse; an unsaved date is forgotten.
  await card.locator('.ms-row[data-value="crawls"]').click();
  assert.equal(await card.locator(".ms-details").count(), 0);
  await card.locator('.ms-row[data-value="first_tooth"]').click();
  await card.locator("#ms-date-first_tooth").fill("2026-04-01");
  await card.locator('.ms-row[data-value="first_tooth"]').click();
  await card.locator('.ms-row[data-value="first_tooth"]').click();
  assert.equal(await card.locator("#ms-date-first_tooth").inputValue(), "2026-05-05");
  await card.locator('.ms-row[data-value="first_tooth"]').click();

  // Expand all, then collapse all.
  await card.locator('[data-action="milestones-all"]').click();
  assert.equal(await card.locator(".ms-details").count(), 7);
  const smile = await card.locator('.ms[data-key="first_smile"] .ms-details').textContent();
  assert.ok(smile.includes("Reached on Feb 20, 2026 (5 weeks)"), smile);
  assert.ok(smile.includes("Most children by 2 months (CDC)"), smile);
  assert.ok(smile.includes("Note: At grandma's"), smile);
  await shot(page, "milestones-expanded");
  // Collapsing one while all are open keeps the others open.
  await card.locator('.ms-row[data-value="crawls"]').click();
  assert.equal(await card.locator(".ms-details").count(), 6);
  await card.locator('[data-action="milestones-all"]').click();
  assert.equal(await card.locator('[data-action="milestones-all"]').getAttribute("aria-pressed"), "true");
  await card.locator('[data-action="milestones-all"]').click();
  assert.equal(await card.locator(".ms-details").count(), 0);

  // Mark a reached milestone as not reached.
  await card.locator('.ms-row[data-value="first_smile"]').click();
  assert.equal(await card.locator("#ms-date-first_smile").inputValue(), "2026-02-20");
  await card.locator('.ms[data-key="first_smile"] [data-action="milestone-clear"]').click();
  assert.deepEqual((await calls(page)).at(-1), ["clear_milestone", { config_entry_id: "e1", milestone: "first_smile" }]);

  // Only your own can be deleted.
  await card.locator('.ms-row[data-value="head_up_tummy"]').click();
  assert.equal(await card.locator('.ms[data-key="head_up_tummy"] [data-action="milestone-delete"]').count(), 0);
  await card.locator('.ms-row[data-value="custom_abc"]').click();
  page.once("dialog", (dialog) => dialog.accept());
  await card.locator('.ms[data-key="custom_abc"] [data-action="milestone-delete"]').click();
  assert.deepEqual((await calls(page)).at(-1), ["delete_milestone", { config_entry_id: "e1", milestone: "custom_abc" }]);
  assert.deepEqual(errors, []);
  await context.close();
});

test("add milestone window suggests similar milestones", async () => {
  const { page, context, errors } = await mount({ config: { parts: ["milestones"] } });
  const card = page.locator("baby-logger-card");
  const dialog = card.locator("dialog.ms-dialog");
  const suggestions = () => dialog.locator(".suggestion .ms-name").allTextContents();
  await card.locator('[data-action="milestone-add-open"]').click();
  assert.ok(await dialog.evaluate((d) => d.open));
  assert.equal(await dialog.locator('[data-action="add-new"]').isDisabled(), true);

  // Tags: "rolling over" finds "Rolls from tummy to back"; "walking" finds first steps.
  await dialog.locator("#ms-add-query").fill("rolling over");
  assert.deepEqual(await suggestions(), ["Rolls from tummy to back"]);
  await dialog.locator("#ms-add-query").fill("Walking");
  assert.deepEqual(await suggestions(), ["First steps on their own"]);
  // Typos and accents.
  await dialog.locator("#ms-add-query").fill("crwal");
  assert.deepEqual(await suggestions(), ["Crawls"]);
  await dialog.locator("#ms-add-query").fill("teéth");
  assert.deepEqual(await suggestions(), ["First tooth"]);
  await shot(page, "milestone-add");

  // Picking a suggestion marks it as reached with the date and note.
  await dialog.locator("#ms-add-note").fill("Two at once");
  await dialog.locator('.suggestion[data-value="first_tooth"]').click();
  assert.deepEqual((await calls(page)).at(-1), [
    "set_milestone",
    { config_entry_id: "e1", milestone: "first_tooth", date: "2026-05-05", note: "Two at once" },
  ]);
  assert.equal(await dialog.evaluate((d) => d.open), false);
  // ... and shows it expanded in the timeline.
  assert.equal(await card.locator('.ms[data-key="first_tooth"] .ms-details').count(), 1);

  // Something new: added as your own, here as not reached yet (date cleared).
  await card.locator('[data-action="milestone-add-open"]').click();
  await dialog.locator("#ms-add-query").fill("First trip to the beach");
  // Updates don't touch the window while typing.
  await page.evaluate((snap) => window.hass.push(snap), snapshot());
  await page.waitForTimeout(20);
  assert.equal(await dialog.locator("#ms-add-query").inputValue(), "First trip to the beach");
  await dialog.locator("#ms-add-date").fill("");
  assert.equal(await dialog.locator('[data-action="add-new"]').textContent(), "Add “First trip to the beach” as new");
  await dialog.locator("#ms-add-query").press("Enter");
  assert.deepEqual((await calls(page)).at(-1), ["add_milestone", { config_entry_id: "e1", name: "First trip to the beach" }]);
  assert.equal(await dialog.evaluate((d) => d.open), false);

  // A new milestone not reached yet is shown expanded once it arrives, not hidden behind "Show more".
  const withNew = snapshot();
  withNew.milestones = [...withNew.milestones, { key: "custom_new", name: "First trip to the beach", category: "custom", months: null, cdc: false, tags: [], custom: true, date: null, note: null }];
  await page.evaluate((snap) => window.hass.push(snap), withNew);
  await page.waitForTimeout(20);
  assert.equal(await card.locator('.ms[data-key="custom_new"] .ms-details').count(), 1);

  // Picking one already reached just shows it; its date isn't changed.
  const before = (await calls(page)).length;
  await card.locator('[data-action="milestone-add-open"]').click();
  await dialog.locator("#ms-add-query").fill("smile");
  await dialog.locator('.suggestion[data-value="first_smile"]').click();
  assert.equal((await calls(page)).length, before);
  assert.equal(await dialog.evaluate((d) => d.open), false);
  assert.equal(await card.locator('.ms[data-key="first_smile"] .ms-details').count(), 1);

  // An exact name match can't be added again; Cancel closes.
  await card.locator('[data-action="milestone-add-open"]').click();
  await dialog.locator("#ms-add-query").fill("first swim");
  assert.equal(await dialog.locator('[data-action="add-new"]').isDisabled(), true);
  assert.equal(await dialog.locator('.suggestion.done').count(), 1);
  await dialog.locator('[data-action="add-cancel"]').click();
  assert.equal(await dialog.evaluate((d) => d.open), false);
  assert.deepEqual(errors, []);
  await context.close();
});

test("updates don't scroll the page to a focused field", async () => {
  const { page, context } = await mount({ config: { parts: ["growth", "header", "tiles", "summary", "trends", "log"] } });
  const card = page.locator("baby-logger-card");
  await card.locator('[data-action="growth-open"]').click();
  await card.locator("#growth-weight").fill("6.5");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const before = await page.evaluate(() => window.scrollY);
  assert.ok(before > 300, `scrolled to ${before}`);
  const today = snapshot().today;
  await page.evaluate((snap) => window.hass.push(snap), snapshot({ revision: 42, today: { ...today, diapers: { ...today.diapers, total: 9 } } }));
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(() => window.scrollY), before);
  // The field keeps its value and focus ...
  assert.equal(await card.locator("#growth-weight").inputValue(), "6.5");
  assert.equal(await page.evaluate(() => document.querySelector("baby-logger-card").shadowRoot.activeElement?.id), "growth-weight");
  // ... while the other parts are updated straight away.
  assert.equal(await card.locator(".chip").first().textContent(), "9 diapers");
  await context.close();
});

test("a rebuilt card keeps the page where it was", async () => {
  const { page, context } = await mount({ config: {} });
  await page.evaluate(() => window.scrollTo(0, 1500));
  const before = await page.evaluate(() => window.scrollY);
  assert.ok(before > 1000, `scrolled to ${before}`);
  // Home Assistant builds the dashboard's cards again, e.g. when the app resumes.
  const first = await page.evaluate(() => {
    const old = document.querySelector("baby-logger-card");
    const card = document.createElement("baby-logger-card");
    card.setConfig({});
    old.replaceWith(card);
    card.hass = window.hass;
    // Tapped before the subscription is ready: still sent for the right baby.
    card.shadowRoot.querySelector('[data-action="diaper"][data-value="wet"]').click();
    return { height: card.getBoundingClientRect().height, scrollY: window.scrollY, entry: window.hass.calls.at(-1)?.data.config_entry_id };
  });
  assert.ok(first.height > 1500, `first render height ${first.height}`);
  assert.equal(first.scrollY, before);
  assert.equal(first.entry, "e1");
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.scrollY), before);
  await context.close();
});

// ------------------------------------------------------------------ medicine & care

function careSnap(extra = {}) {
  const base = snapshot();
  const dayIso = (daysAgo, time) => {
    const d = new Date("2026-05-05T12:00:00+02:00");
    d.setDate(d.getDate() - daysAgo);
    return iso(time, d.toISOString().slice(0, 10));
  };
  const care = [
    { id: "t1", kind: "care", start: dayIso(3, "19:00"), end: null, care_type: "temperature", text: null, value: 38.6, treatment_id: null },
    { id: "m1", kind: "care", start: dayIso(3, "19:10"), end: null, care_type: "medicine", text: "Paracetamol 120 mg", value: null, treatment_id: "tr1" },
    { id: "t2", kind: "care", start: dayIso(2, "08:00"), end: null, care_type: "temperature", text: null, value: 38.1, treatment_id: null },
    { id: "m2", kind: "care", start: dayIso(2, "08:15"), end: null, care_type: "medicine", text: "Paracetamol 120 mg", value: null, treatment_id: "tr1" },
    { id: "t3", kind: "care", start: dayIso(1, "09:00"), end: null, care_type: "temperature", text: null, value: 37.4, treatment_id: null },
    { id: "b1", kind: "care", start: iso("09:30"), end: null, care_type: "type_bath", text: null, value: null, treatment_id: null },
    { id: "m3", kind: "care", start: iso("08:10"), end: null, care_type: "medicine", text: "Paracetamol 120 mg", value: null, treatment_id: "tr1" },
  ];
  return snapshot({
    events: [...base.events, ...care],
    care: {
      types: [{ id: "type_bath", name: "Bath", emoji: "🛁", unit: null, deleted: false }],
      treatments: [
        {
          id: "tr1", name: "Paracetamol", dose: "120 mg", label: "Paracetamol 120 mg", every_hours: 6,
          start: dayIso(3, "19:00"), end: dayIso(-2, "19:00"), stopped: null,
          doses: 3, doses_today: 1, last_dose: iso("08:10"), next_dose: iso("14:10"),
        },
        {
          id: "tr2", name: "Nose drops", dose: null, label: "Nose drops", every_hours: null,
          start: dayIso(1, "10:00"), end: null, stopped: null, doses: 0, doses_today: 0, last_dose: null, next_dose: null,
        },
      ],
      recent: [{ care_type: "medicine", text: "Paracetamol 120 mg" }, { care_type: "medicine", text: "Vitamin D 10 µg" }],
    },
    ...extra,
  });
}

test("care: treatments, charts and entries in the log", async () => {
  const { page, context, errors } = await mount({ config: { parts: ["care", "log"] }, snap: careSnap() });
  const card = page.locator("baby-logger-card");
  const tiles = card.locator(".treatment");
  assert.equal(await tiles.count(), 2);
  // The next dose was due at 14:10 (it's 15:00): highlighted.
  assert.ok(await tiles.first().evaluate((el) => el.classList.contains("due")));
  assert.equal(await tiles.first().locator(".tr-meta").textContent(), "Every 6 h · last 08:10 AM · due since 02:10 PM · day 3 of 5");
  assert.equal(await tiles.nth(1).locator(".tr-meta").textContent(), "As needed · not given yet");
  assert.equal(await tiles.first().locator(".tr-progress").count(), 1);
  assert.equal(await tiles.nth(1).locator(".tr-progress").count(), 0);
  // Default charts: temperature (a line, with the fever band and doses marked) and medicine per day.
  assert.deepEqual(await card.locator(".care-part .chart-title").allTextContents(), ["Temperature (°C)", "Medicine · per day"]);
  assert.equal(await card.locator(".care-part svg.care-chart circle.point").count(), 3);
  assert.equal(await card.locator(".care-part svg.care-chart path.marker").count(), 3);
  assert.equal(await card.locator(".care-part svg.care-chart rect.band").count(), 1);
  // The log shows care entries with their type.
  const texts = await card.locator("ul.log li:not(.day) .text").allTextContents();
  assert.ok(texts.includes("Paracetamol 120 mg"));
  assert.ok(texts.includes("Bath"));
  await shot(page, "care");
  // Give a dose, stop a treatment.
  await tiles.first().locator('[data-action="care-dose"]').click();
  page.once("dialog", (d) => d.accept());
  await tiles.nth(1).locator('[data-action="care-stop"]').click();
  const calls = await page.evaluate(() => window.hass.calls.map((c) => [c.service, c.data]));
  assert.deepEqual(calls, [
    ["give_dose", { config_entry_id: "e1", treatment_id: "tr1" }],
    ["stop_treatment", { config_entry_id: "e1", treatment_id: "tr2" }],
  ]);
  assert.deepEqual(errors, []);
  await context.close();
});

test("care: adding entries, treatments and types", async () => {
  const { page, context, errors } = await mount({ config: { parts: ["care"], units: "imperial" }, snap: careSnap() });
  const card = page.locator("baby-logger-card");
  const lastCall = () => page.evaluate(() => window.hass.calls.at(-1));
  await card.locator('[data-action="care-open"]').click();
  // Medicine: a recent entry fills the text.
  await card.locator('[data-action="care-recent"]', { hasText: "Vitamin D" }).click();
  assert.equal(await card.locator("#care-first").inputValue(), "Vitamin D 10 µg");
  await shot(page, "care-add");
  await card.locator('[data-action="care-save"]').click();
  assert.deepEqual(await lastCall(), { domain: "baby_logger", service: "log_entry", data: { config_entry_id: "e1", type: "medicine", text: "Vitamin D 10 µg" } });
  assert.equal(await card.locator(".care-form").count(), 0);
  // Temperature in °F (the card's units), typed and saved with Enter; the form survives an update.
  await card.locator('[data-action="care-open"]').click();
  await card.locator('[data-action="care-mode"][data-value="temperature"]').click();
  assert.match(await card.locator(".care-form label").first().textContent(), /°F/);
  await card.locator("#care-first").fill("101.3");
  await page.evaluate((snap) => window.hass.push(snap), careSnap());
  await page.waitForTimeout(30);
  assert.equal(await card.locator("#care-first").inputValue(), "101.3");
  await card.locator("#care-first").press("Enter");
  assert.deepEqual((await lastCall()).data, { config_entry_id: "e1", type: "temperature", value: 101.3, units: "imperial" });
  // Nothing typed: nothing is called.
  await card.locator('[data-action="care-open"]').click();
  const before = await page.evaluate(() => window.hass.calls.length);
  await card.locator('[data-action="care-mode"][data-value="note"]').click();
  await card.locator('[data-action="care-save"]').click();
  assert.equal(await page.evaluate(() => window.hass.calls.length), before);
  // With a time.
  await card.locator("#care-first").fill("Doctor");
  await card.locator('input[data-field="time"]').fill("2026-05-05T10:30");
  await card.locator('[data-action="care-save"]').click();
  assert.deepEqual((await lastCall()).data, { config_entry_id: "e1", type: "note", text: "Doctor", time: iso("10:30") });
  // A type of the user's own.
  await card.locator('[data-action="care-open"]').click();
  await card.locator('[data-action="care-mode"][data-value="type_bath"]').click();
  await card.locator('[data-action="care-save"]').click();
  assert.deepEqual((await lastCall()).data, { config_entry_id: "e1", type: "type_bath" });
  // A treatment.
  await card.locator('[data-action="care-open"]').click();
  await card.locator('[data-action="care-mode"][data-value="treatment"]').click();
  await card.locator("#care-first").fill("Antibiotic");
  await card.locator('input[data-field="dose"]').fill("2.5 ml");
  await card.locator('input[data-field="every"]').fill("7.5");
  await card.locator('input[data-field="days"]').fill("7");
  await card.locator('[data-action="care-save"]').click();
  assert.deepEqual((await lastCall()).data, { config_entry_id: "e1", name: "Antibiotic", dose: "2.5 ml", every_hours: 7.5, days: 7 });
  // A new type, and removing one.
  await card.locator('[data-action="care-open"]').click();
  await card.locator('[data-action="care-mode"][data-value="newtype"]').click();
  await card.locator("#care-first").fill("Pumping");
  await card.locator('input[data-field="unit"]').fill("ml");
  await card.locator('[data-action="care-save"]').click();
  assert.deepEqual((await lastCall()).data, { config_entry_id: "e1", name: "Pumping", unit: "ml" });
  await card.locator('[data-action="care-open"]').click();
  await card.locator('[data-action="care-mode"][data-value="newtype"]').click();
  page.once("dialog", (d) => d.accept());
  await card.locator('[data-action="care-type-delete"]').click();
  assert.deepEqual((await lastCall()).data, { config_entry_id: "e1", care_type: "type_bath" });
  assert.deepEqual(errors, []);
  await context.close();
});

test("care: chosen charts, trends and Danish", async () => {
  const config = { parts: ["care", "trends"], care_charts: "temperatur, bath, paracetamol, none", care_trends: ["temperature"] };
  const { page, context, errors } = await mount({ config, snap: careSnap(), language: "da" });
  const card = page.locator("baby-logger-card");
  assert.deepEqual(await card.locator(".care-part .chart-title").allTextContents(), ["Temperatur (°C)", "🛁 Bath · pr. dag", "paracetamol · pr. dag"]);
  assert.match(await card.locator(".treatment").first().locator(".tr-meta").textContent(), /^Hver 6\. time · seneste 08\.10 · skulle gives 14\.10 · dag 3 af 5$/);
  // The temperature chart also in the trends part.
  const trendTitles = await card.locator(".section:not(.care-part) .chart-title").allTextContents();
  assert.equal(trendTitles.at(-1), "Temperatur (°C)");
  assert.equal(await card.locator('[data-action="care-open"]').textContent(), "Tilføj");
  assert.deepEqual(errors, []);
  await context.close();
});

test("care: empty part and cards without it", async () => {
  let { page, context } = await mount({ config: { parts: ["care"] }, snap: snapshot({ care: { types: [], treatments: [], recent: [] } }) });
  assert.match(await page.locator("baby-logger-card .care-part .message").textContent(), /No treatments right now/);
  await context.close();
  // Without care data at all (an older integration) the part still renders.
  ({ page, context } = await mount({ config: { parts: ["care"] } }));
  assert.equal(await page.locator("baby-logger-card .care-part").count(), 1);
  await context.close();
  // Not shown unless chosen.
  ({ page, context } = await mount({ snap: careSnap() }));
  assert.equal(await page.locator("baby-logger-card .care-part").count(), 0);
  await context.close();
});

test("care: editing a treatment", async () => {
  const { page, context, errors } = await mount({ config: { parts: ["care"] }, snap: careSnap(), language: "da" });
  const card = page.locator("baby-logger-card");
  const lastCall = () => page.evaluate(() => window.hass.calls.at(-1));
  await card.locator('[data-action="care-edit"][data-value="tr1"]').click();
  // Filled in with the treatment; no type chips while editing.
  assert.equal(await card.locator(".care-edit-title").textContent(), "Ændr behandling");
  assert.equal(await card.locator(".care-modes").count(), 0);
  assert.equal(await card.locator("#care-first").inputValue(), "Paracetamol");
  assert.equal(await card.locator('input[data-field="dose"]').inputValue(), "120 mg");
  assert.equal(await card.locator('input[data-field="every"]').inputValue(), "6");
  assert.equal(await card.locator('input[data-field="days"]').inputValue(), "5");
  assert.equal(await card.locator('input[data-field="start"]').inputValue(), "2026-05-02T19:00");
  await shot(page, "care-edit");
  await card.locator('input[data-field="every"]').fill("4.5");
  await card.locator('input[data-field="days"]').fill("");
  await card.locator('[data-action="care-save"]').click();
  assert.deepEqual((await lastCall()).data, {
    config_entry_id: "e1", treatment_id: "tr1", name: "Paracetamol", start: iso("19:00", "2026-05-02"), dose: "120 mg", every_hours: 4.5, days: 0,
  });
  assert.equal(await card.locator(".care-form").count(), 0);
  // An as-needed treatment: empty fields, saved as 0.
  await card.locator('[data-action="care-edit"][data-value="tr2"]').click();
  assert.equal(await card.locator('input[data-field="every"]').inputValue(), "");
  await card.locator('input[data-field="dose"]').fill("2 drops");
  await card.locator('[data-action="care-save"]').click();
  const data = (await lastCall()).data;
  assert.deepEqual([data.service, data.dose, data.every_hours, data.days], [undefined, "2 drops", 0, 0]);
  assert.equal((await lastCall()).service, "update_treatment");
  assert.deepEqual(errors, []);
  await context.close();
});
