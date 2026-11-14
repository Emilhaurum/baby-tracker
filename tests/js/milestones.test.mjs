// Unit tests for the milestone timeline order and the add-milestone search.
//   TZ=Europe/Copenhagen node --test tests/js/*.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";

globalThis.HTMLElement = class {};
globalThis.window = globalThis;
globalThis.customElements = { get: () => true, define: () => {} };

const { milestoneTimeline, matchMilestones, normalizeText, editDistance } = await import(
  "../../custom_components/baby_logger/frontend/baby-logger-card.js"
);

const m = (key, name, extra = {}) => ({ key, name, category: "movement", months: null, tags: [], date: null, ...extra });
const CATALOGUE = [
  m("rolls_tummy_to_back", "Rolls from tummy to back", { months: 6, tags: ["roll", "rolling", "rolls over", "turns over", "flip"] }),
  m("crawls", "Crawls", { months: 9, tags: ["crawl", "crawling", "creeping", "scoot"] }),
  m("first_steps", "First steps on their own", { months: 12, tags: ["walk", "walking", "steps", "step", "toddle"] }),
  m("walks", "Walks without holding on", { months: 18, tags: ["walk", "walking", "toddle", "walks alone"] }),
  m("first_word", "First word (“mama”, “dada” …)", { months: 12, tags: ["word", "talk", "talking", "speak", "mama", "dada"] }),
  m("first_tooth", "First tooth", { months: 6, category: "firsts", tags: ["tooth", "teeth", "teething"] }),
  m("first_smile", "First social smile", { months: 2, category: "social", tags: ["smile", "smiling"], date: "2026-02-20" }),
  m("custom_1", "First swim", { category: "custom", custom: true, date: "2026-04-02" }),
];
const keys = (query) => matchMilestones(query, CATALOGUE).map((x) => x.key);

test("timeline: reached by date, then upcoming by typical age", () => {
  const { reached, upcoming } = milestoneTimeline([
    m("b", "B", { months: 12 }),
    m("x", "X", { date: "2026-04-01" }),
    m("c", "C"),
    m("a", "A", { months: 6 }),
    m("y", "Y", { date: "2026-02-01" }),
    m("d", "D", { months: 6 }),
  ]);
  assert.deepEqual(reached.map((x) => x.key), ["y", "x"]);
  // Same typical age keeps the catalogue order; no age goes last.
  assert.deepEqual(upcoming.map((x) => x.key), ["a", "d", "b", "c"]);
  assert.deepEqual(milestoneTimeline(undefined), { reached: [], upcoming: [] });
});

test("search: names and tags, any word ending", () => {
  assert.deepEqual(keys("crawling"), ["crawls"]);
  assert.deepEqual(keys("rolled over"), ["rolls_tummy_to_back"]);
  assert.deepEqual(keys("turns over"), ["rolls_tummy_to_back"]);
  assert.deepEqual(keys("teething"), ["first_tooth"]);
  assert.deepEqual(keys("said mama"), ["first_word"]);
  // Both walking milestones, the first steps first (more words match the name).
  assert.deepEqual(keys("first steps"), ["first_steps"]);
  assert.deepEqual(keys("walking").sort(), ["first_steps", "walks"]);
});

test("search: case, accents and small typos", () => {
  assert.deepEqual(keys("CRAWLS"), ["crawls"]);
  assert.deepEqual(keys("téeth"), ["first_tooth"]);
  assert.deepEqual(keys("crwal"), ["crawls"]);
  assert.deepEqual(keys("teehting"), ["first_tooth"]);
  // A typo match is dropped when something matches as typed.
  assert.deepEqual(keys("talking"), ["first_word"]);
});

test("search: every word has to match, and reached ones go last", () => {
  assert.deepEqual(keys("first swim"), ["custom_1"]);
  assert.deepEqual(keys("first trip to the beach"), []);
  assert.deepEqual(keys(""), []);
  assert.deepEqual(keys("the"), []);
  const first = keys("first");
  assert.deepEqual(first.slice(-2).sort(), ["custom_1", "first_smile"]);
  assert.equal(matchMilestones("first", CATALOGUE, 2).length, 2);
});

test("text helpers", () => {
  assert.equal(normalizeText("  Peek-a-Boo! Ünïcode "), "peek a boo unicode");
  assert.equal(editDistance("crawl", "crwal"), 1);
  assert.equal(editDistance("walk", "talk"), 1);
  assert.equal(editDistance("", "abc"), 3);
  assert.equal(editDistance("tooth", "teeth"), 2);
});
