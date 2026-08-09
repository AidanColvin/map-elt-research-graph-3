// takes: a base URL (argv[2], default http://localhost:3010)
// does: runs a real Pfizer company report through the app as a guest and dumps
//       the report text, so the homepage demo panel can be seeded with genuine
//       publication / trial / grant figures instead of invented ones
// returns: prints the report body text and any matched counts

import { chromium } from "playwright";

const BASE = process.argv[2] || "http://localhost:3010";

// takes: the full report text
// does: pulls out the first number preceding each source-specific keyword
// returns: an object of candidate counts keyed by source
function extractCounts(text) {
  const patterns = {
    publications: /(\d[\d,]*)\s+(?:UNC[- ]co[- ]?authored\s+)?publications?/i,
    trials: /(\d[\d,]*)\s+(?:active\s+)?(?:clinical\s+)?trials?/i,
    grants: /(\d[\d,]*)\s+(?:active\s+)?(?:NIH\s+)?(?:grants?|awards?)/i,
  };
  const out = {};
  for (const [key, re] of Object.entries(patterns)) {
    const m = text.match(re);
    out[key] = m ? m[0] : null;
  }
  return out;
}

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

await page.goto(`${BASE}/?skipIntro=1`, { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: /continue as guest/i }).click();
await page.waitForSelector("input[aria-label*='Search' i]");
await page.mouse.move(5, 5);

await page.fill("input[aria-label*='Search' i]", "Pfizer");
await page.getByRole("button", { name: /generate report/i }).first().click();

// A real company dive hits SEC EDGAR and the research sources; give it room.
await page.waitForTimeout(60000);

const bodyText = await page.evaluate(() => document.body.innerText);
const { writeFileSync } = await import("node:fs");
writeFileSync("/tmp/map-verify/pfizer-report.txt", bodyText, "utf8");
console.log(`=== FULL REPORT WRITTEN (${bodyText.length} chars) ===`);
console.log("=== CANDIDATE COUNTS ===");
console.log(JSON.stringify(extractCounts(bodyText), null, 2));

await page.screenshot({ path: "/tmp/map-verify/pfizer-report.png", fullPage: true });
await browser.close();
