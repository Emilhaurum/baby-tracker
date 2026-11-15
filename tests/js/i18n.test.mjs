// Unit tests for the card's languages (English and Danish).
//   TZ=Europe/Copenhagen node --test tests/js/*.test.mjs
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

globalThis.HTMLElement = class {};
globalThis.window = globalThis;
globalThis.customElements = { get: () => true, define: () => {} };

const { I18N, LANGUAGES, setLanguage, cardLanguage, t, num, formatAge, formatDuration, formatWeight, formatLength, milestoneName, matchMilestones } =
  await import("../../custom_components/baby_logger/frontend/baby-logger-card.js");

afterEach(() => setLanguage("en"));

test("Danish has every English text, with the same placeholders", () => {
  assert.deepEqual(Object.keys(LANGUAGES), Object.keys(I18N));
  const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const [key, en] of Object.entries(I18N.en)) {
    const da = I18N.da[key];
    assert.ok(da !== undefined, `missing Danish text for ${key}`);
    if (Array.isArray(en)) {
      assert.ok(Array.isArray(da) && da.length === 2, key);
    } else {
      assert.deepEqual(placeholders(da), placeholders(en), key);
    }
  }
  assert.deepEqual(Object.keys(I18N.da).sort(), Object.keys(I18N.en).sort());
});

test("the card follows the Home Assistant user's language unless set", () => {
  assert.equal(cardLanguage({}, { locale: { language: "da" } }), "da");
  assert.equal(cardLanguage({}, { language: "da-DK" }), "da");
  assert.equal(cardLanguage({ language: "auto" }, { locale: { language: "da" } }), "da");
  assert.equal(cardLanguage({ language: "en" }, { locale: { language: "da" } }), "en");
  assert.equal(cardLanguage({ language: "da" }, { locale: { language: "en" } }), "da");
  // Anything else is English.
  assert.equal(cardLanguage({}, { locale: { language: "fr" } }), "en");
  assert.equal(cardLanguage({ language: "xx" }, { locale: { language: "en" } }), "en");
  // Before a card has hass (e.g. rebuilt from the cache) it uses the language last seen.
  cardLanguage({}, { locale: { language: "da" } });
  assert.equal(cardLanguage({}, undefined), "da");
  cardLanguage({}, { locale: { language: "en" } });
  assert.equal(cardLanguage({}, undefined), "en");
});

test("texts, numbers and durations in Danish", () => {
  setLanguage("da");
  assert.equal(t("tile.diaper"), "Ble");
  assert.equal(t("ms.more", { n: 3 }), "Vis 3 mere");
  assert.equal(num(8.46, 1), "8,5");
  assert.equal(formatDuration(125 * 60000), "2t 05m");
  assert.equal(formatWeight(6.1, "metric"), "6,10 kg");
  assert.equal(formatLength(56, "metric"), "56,0 cm");
  assert.equal(formatWeight(6.1, "imperial"), "13 lb 7,2 oz");
  setLanguage("en");
  assert.equal(num(8.46, 1), "8.5");
  assert.equal(formatDuration(125 * 60000), "2h 05m");
  assert.equal(formatWeight(6.1, "metric"), "6.10 kg");
  // Unknown keys and languages fall back.
  setLanguage("fr");
  assert.equal(t("tile.diaper"), "Diaper");
  assert.equal(t("no.such.key"), "no.such.key");
});

test("ages in Danish", () => {
  setLanguage("da");
  assert.equal(formatAge("2026-01-15", "2026-01-15"), "ved fødslen");
  assert.equal(formatAge("2026-01-15", "2026-01-16"), "1 dag");
  assert.equal(formatAge("2026-01-15", "2026-01-20"), "5 dage");
  assert.equal(formatAge("2026-01-15", "2026-03-01"), "6 uger");
  assert.equal(formatAge("2026-01-15", "2026-05-20"), "4 måneder");
  assert.equal(formatAge("2024-01-15", "2027-04-20"), "3 år 3 måneder");
});

const m = (key, name, da, extra = {}) => ({
  key, name, category: "movement", months: null, tags: [], date: null,
  i18n: da ? { da: { name: da[0], tags: da[1] } } : {}, ...extra,
});
const CATALOGUE = [
  m("crawls", "Crawls", ["Kravler", ["kravle", "kravler", "kravlede"]], { tags: ["crawl", "crawling"] }),
  m("first_tooth", "First tooth", ["Første tand", ["tand", "tænder", "tandfrembrud"]], { tags: ["tooth", "teeth"] }),
  m("first_steps", "First steps on their own", ["Første skridt på egen hånd", ["går", "gå", "skridt"]], { tags: ["walk", "walking"] }),
  m("first_word", "First word", ["Første ord", ["ord", "siger", "sagde", "mor"]], { tags: ["word", "talk"] }),
  m("custom_1", "Svømmetur", null, { custom: true }),
];

test("milestone names and search in Danish", () => {
  setLanguage("da");
  assert.equal(milestoneName(CATALOGUE[0]), "Kravler");
  assert.equal(milestoneName(CATALOGUE.find((x) => x.key === "custom_1")), "Svømmetur");
  const keys = (q) => matchMilestones(q, CATALOGUE).map((x) => x.key);
  assert.deepEqual(keys("kravler"), ["crawls"]);
  assert.deepEqual(keys("tænder"), ["first_tooth"]);
  assert.deepEqual(keys("første skridt"), ["first_steps"]);
  assert.deepEqual(keys("svømmetur"), ["custom_1"]);
  assert.deepEqual(keys("sagde mor"), ["first_word"]);
  assert.deepEqual(keys("siger"), ["first_word"]);
  // English words still find them.
  assert.deepEqual(keys("crawling"), ["crawls"]);
  setLanguage("en");
  assert.equal(milestoneName(CATALOGUE[0]), "Crawls");
  // ... and Danish words work in English too.
  assert.deepEqual(keys("tænder"), ["first_tooth"]);
});
