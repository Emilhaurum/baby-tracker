// The page must not jump when the card changes, on a phone, in Chromium and in WebKit
// (iOS). Safari used to scroll the page whenever the card's content changed.
//   node tests/e2e/scroll.mjs http://localhost:8124 tokens.json [chromium|webkit]
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium, webkit, devices } = require("playwright");

const [base = "http://localhost:8124", tokensFile = "tokens.json", engine = "chromium"] = process.argv.slice(2);
const tokens = JSON.parse(readFileSync(tokensFile, "utf8"));
const browser = await (engine === "webkit" ? webkit : chromium).launch();
const context = await browser.newContext({ ...devices[engine === "webkit" ? "iPhone 15" : "Pixel 7"] });
await context.addInitScript(
  ([t, b]) => {
    window.localStorage.setItem(
      "hassTokens",
      JSON.stringify({
        access_token: t.access_token,
        refresh_token: t.refresh_token,
        token_type: "Bearer",
        expires_in: t.expires_in,
        expires: Date.now() + t.expires_in * 1000,
        hassUrl: b,
        clientId: t.client_id,
      })
    );
  },
  [tokens, base]
);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`${base}/dashboard-baby/phone`);
const card = page.locator("baby-logger-card").last();
await card.locator(".ms-timeline").waitFor({ timeout: 60000 });
await page.waitForTimeout(2000);

const scrollY = () => page.evaluate(() => (document.scrollingElement || document.documentElement).scrollTop);
let failures = 0;
const check = async (label, action) => {
  const before = await scrollY();
  await action();
  await page.waitForTimeout(1000);
  const after = await scrollY();
  const ok = Math.abs(after - before) < 5;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${engine} ${label}: ${before} -> ${after}`);
};
const tap = async (selector) => {
  const el = card.locator(selector).first();
  await el.evaluate((e) => e.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(400);
  await check(`tap ${selector}`, async () => {
    const box = await el.boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  });
};

for (const selector of [
  '[data-action="growth-list"]',
  '[data-action="milestones-more"]',
  ".ms-row",
  '[data-action="milestones-all"]',
  '[data-action="milestones-all"]',
  '[data-action="growth-list"]',
]) {
  await tap(selector);
}

// New data while reading the middle of the page (logged elsewhere, e.g. on another phone).
await page.evaluate(() => window.scrollTo(0, 900));
await page.waitForTimeout(500);
await check("update", async () => {
  const resp = await fetch(`${base}/api/services/baby_logger/log_diaper`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokens.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ config_entry_id: tokens.entry_id, type: "wet" }),
  });
  if (!resp.ok) throw new Error(`log_diaper: ${resp.status}`);
  await page.waitForTimeout(1000);
});

// The connection drops and comes back, as when the app returns from the background.
await check("reconnect", async () => {
  await page.evaluate(() => document.querySelector("home-assistant").hass.connection.socket.close());
  await page.waitForTimeout(8000);
});

await browser.close();
if (errors.length) {
  console.error(`FAIL: page errors: ${errors.join(" | ")}`);
  failures++;
}
if (failures) {
  console.error(`FAIL: the page jumped ${failures} time(s)`);
  process.exitCode = 1;
} else {
  console.log(`scroll e2e OK (${engine})`);
}
