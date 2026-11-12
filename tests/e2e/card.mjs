// Browser test of the dashboard card against a running Home Assistant.
//   node tests/e2e/card.mjs http://localhost:8124 tokens.json out-dir
import { readFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const [base = "http://localhost:8124", tokensFile = "tokens.json", outDir = "e2e-output"] = process.argv.slice(2);
const tokens = JSON.parse(readFileSync(tokensFile, "utf8"));
mkdirSync(outDir, { recursive: true });

const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  process.exitCode = 1;
};

const browser = await chromium.launch();
const errors = [];
for (const scheme of ["light", "dark"]) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 1500 }, colorScheme: scheme, deviceScaleFactor: 1 });
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
      window.localStorage.setItem("selectedTheme", JSON.stringify({ theme: "default", dark: matchMedia("(prefers-color-scheme: dark)").matches }));
    },
    [tokens, base]
  );
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error" && /baby/i.test(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${base}/dashboard-baby/baby`);
  const card = page.locator("baby-logger-card");
  await card.waitFor({ timeout: 60000 });
  // Wait for the subscription to deliver data.
  await card.locator(".tiles").waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  await card.screenshot({ path: `${outDir}/card-${scheme}.png` });
  await context.close();
}

// Interaction test: log a diaper and a feeding, check the log and undo.
const context = await browser.newContext({ viewport: { width: 420, height: 1800 } });
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
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`${base}/dashboard-baby/baby`);
const card = page.locator("baby-logger-card");
await card.locator(".tiles").waitFor({ timeout: 60000 });

// The sleep timeline shows one line per day (14 by default).
await card.locator(".timeline").waitFor({ timeout: 30000 });
const timelineLines = await card.locator(".timeline .tl-row:not(.tl-axis)").count();
if (timelineLines !== 14) fail(`expected 14 timeline lines, got ${timelineLines}`);

// The night sleep chart uses the integration's night window (22:00-09:00 by default).
const nightSummary = await card.locator(".night-summary").textContent();
if (!nightSummary.includes("Night 22:00–09:00")) fail(`night chart summary: ${nightSummary}`);

const chip = async () => (await card.locator(".chip").first().textContent()).trim();
const before = await chip();
await card.locator('[data-action="diaper"][data-value="both"]').click();
await page.waitForTimeout(1000);
const after = await chip();
if (before === after) fail(`diaper count did not change (${before})`);
if (!(await card.locator(".undo").isVisible())) fail("undo bar not shown");
const logText = await card.locator(".log").textContent();
if (!logText.includes("Diaper: Both")) fail("log does not show the new diaper");

await card.locator('[data-action="undo"]').click();
await page.waitForTimeout(1000);
if ((await chip()) !== before) fail("undo did not revert the diaper");

await card.locator('[data-action="feed"][data-value="bottle"]').click();
await card.locator("#bottle-amount").fill("90");
await card.locator('[data-action="bottle-log"]').click();
await page.waitForTimeout(1000);
if (!(await card.locator(".chips").textContent()).includes("90 ml")) fail("bottle amount not shown");

await card.locator('[data-action="sleep"]').click();
await page.waitForTimeout(1000);
if (!(await card.locator(".tile.sleeping").isVisible())) fail("sleep did not start");
await card.screenshot({ path: `${outDir}/card-mobile.png` });

// The card editor loads.
await page.evaluate(async () => {
  const el = await customElements.get("baby-logger-card").getConfigElement();
  document.body.appendChild(el);
});

await browser.close();
if (errors.length) fail(`page errors: ${errors.join(" | ")}`);
if (!process.exitCode) console.log("card e2e OK");
