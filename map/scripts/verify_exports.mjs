// takes: a base URL (argv[2]) and a download directory (argv[3])
// does: generates a real company report as a guest, downloads every export it
//       offers, and checks each file is a complete, well-formed document
// returns: prints a JSON result; exits non-zero if any file is missing or corrupt

import { chromium } from "playwright";
import { readFileSync, statSync, mkdirSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:3010";
const DIR = process.argv[3] || "/tmp/map-verify/downloads";
const SEARCH = "input[aria-label*='Search' i]";

// Leading bytes that prove a file really is what its extension claims.
const SIGNATURES = {
  pdf: { magic: "%PDF-", minBytes: 1000 },
  docx: { magic: "PK", minBytes: 1000 },
  zip: { magic: "PK", minBytes: 500 },
};

// takes: a downloaded file path
// does: reads its first bytes and size and matches them against the signature
//       expected for its extension
// returns: a verdict object for that file
function inspect(path) {
  const ext = path.split(".").pop().toLowerCase();
  const size = statSync(path).size;
  const head = readFileSync(path).subarray(0, 8).toString("binary");
  const sig = SIGNATURES[ext];
  if (!sig) return { path, ext, size, ok: size > 20, note: "no signature check for this type" };
  return {
    path: path.split("/").pop(),
    ext,
    size,
    ok: head.startsWith(sig.magic) && size >= sig.minBytes,
  };
}

mkdirSync(DIR, { recursive: true });
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
const failures = [];

await page.goto(`${BASE}/?skipIntro=1`, { waitUntil: "domcontentloaded" });
const guest = page.getByRole("button", { name: /continue as guest/i });
if (await guest.count()) await guest.click();
await page.waitForSelector(SEARCH);
await page.fill(SEARCH, "Pfizer");
await page.getByRole("button", { name: /generate report/i }).first().click();
await page.waitForSelector("text=/Download PDF/i", { timeout: 120000 });
await page.waitForTimeout(3000);

const files = [];
for (const label of [/Download PDF/i, /Download DOCX/i, /^Markdown$/i]) {
  const button = page.getByRole("button", { name: label }).first();
  if (!(await button.count())) {
    failures.push(`export button ${label} not found`);
    continue;
  }
  try {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 60000 }),
      button.click(),
    ]);
    const target = `${DIR}/${download.suggestedFilename()}`;
    await download.saveAs(target);
    const verdict = inspect(target);
    files.push(verdict);
    if (!verdict.ok) failures.push(`${verdict.path} failed its integrity check`);
  } catch (err) {
    failures.push(`${label} did not produce a download: ${err.message.split("\n")[0]}`);
  }
}

console.log(JSON.stringify({ files, failures }, null, 2));
await context.close();
await browser.close();

if (failures.length) {
  console.error("FAIL");
  process.exit(1);
}
console.log("PASS");
