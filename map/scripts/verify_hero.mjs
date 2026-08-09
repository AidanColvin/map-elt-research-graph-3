// takes: a base URL (argv[2]) and an output directory for screenshots (argv[3])
// does: verifies the Tier 4 hero — that the first viewport holds only the
//       header, headline, sub and field; that the field's metrics, shadow and
//       behavior survived the rescale; and that the entrance animation shifts
//       no layout
// returns: prints one PASS/FAIL line per check and exits non-zero on any failure

import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:3010";
const DIR = process.argv[3] || "/Users/aidancolvin/map-elt-research-graph-3/qa-viewports";
const HOME = ".dash-home";
// Pre-existing noise: CompanyLogo.tsx requests gstatic favicons the CSP
// blocks, logging a "Failed to load resource" 404 plus a separate
// CSP-violation line. Same filter the rest of the suite uses
// (verify_home.mjs, tests/e2e/sector-package.spec.ts).
const KNOWN_NOISE = /favicon|gstatic|Failed to load resource|net::ERR_/i;

// Reference viewports: two phones, two tablets, two desktops.
const VIEWPORTS = [
  { label: "iphone-390", width: 390, height: 844, phone: true },
  { label: "iphone-430", width: 430, height: 932, phone: true },
  { label: "ipad-768", width: 768, height: 1024, phone: false },
  { label: "ipad-834", width: 834, height: 1194, phone: false },
  { label: "laptop-1180", width: 1180, height: 820, phone: false },
  { label: "desktop-1440", width: 1440, height: 900, phone: false },
];

const results = [];

// takes: a check name and a boolean-or-string outcome
// does: records the outcome and prints it as one line
// returns: nothing
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

// takes: a playwright page already on the homepage
// does: measures the hero's box, the field's box and the demo panel's top edge
// returns: an object of measurements in css pixels
async function measureHero(page) {
  return page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height, width: r.width, left: r.left, right: r.right };
    };
    const field = document.querySelector(".home-field");
    const input = document.querySelector(".home-field input");
    const cta = document.querySelector(".home-cta");
    const style = (el) => (el ? getComputedStyle(el) : null);
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      h1: box("h1"),
      sub: box(".home-sub"),
      field: box(".home-field"),
      cta: box(".home-cta"),
      demo: box('[role="group"]'),
      inputFontPx: parseFloat(style(input)?.fontSize || "0"),
      ghostFontPx: parseFloat(style(document.querySelector(".home-field-text"))?.fontSize || "0"),
      fieldShadow: style(field)?.boxShadow || "",
      demoShadow: style(document.querySelector('[role="group"]'))?.boxShadow || "",
      ctaHeight: cta ? cta.getBoundingClientRect().height : 0,
      docScrollW: document.documentElement.scrollWidth,
      shadowedAboveFold: Array.from(document.querySelectorAll(".dash-home *"))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return r.top < window.innerHeight && r.height > 0 && s.boxShadow !== "none" && !s.boxShadow.includes("rgba(0, 122, 255");
        }).length,
    };
  });
}

// takes: a browser, one viewport spec
// does: loads the homepage as a guest and runs every layout check for that size
// returns: nothing (records results)
async function runViewport(browser, vp) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !KNOWN_NOISE.test(m.text())) errors.push(m.text());
  });

  await page.goto(`${BASE}/?skipIntro=1`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(HOME);
  await page.mouse.move(2, 2);
  await page.waitForTimeout(1200);

  const m = await measureHero(page);
  const tag = `[${vp.label}]`;

  check(`${tag} no horizontal scroll`, m.docScrollW <= vp.width + 1, `scrollWidth ${m.docScrollW}`);
  check(`${tag} headline, sub and field all in the first screen`,
    m.h1.top >= 0 && m.field.bottom <= m.viewport.h,
    `h1 top ${Math.round(m.h1.top)}, field bottom ${Math.round(m.field.bottom)} of ${m.viewport.h}`);
  if (vp.phone) {
    // Phones get natural flow with a ~70svh hero, not a hard "nothing else on
    // screen" rule — so only check that the hero occupies roughly that share
    // of the viewport, not that the demo panel is fully off-screen.
    const heroShare = m.field.bottom / m.viewport.h;
    check(`${tag} hero occupies roughly 70% of the screen`, heroShare > 0.55 && heroShare < 0.85,
      `field bottom at ${Math.round(heroShare * 100)}% of viewport height`);
  } else {
    check(`${tag} demo panel starts below the fold`,
      m.demo.top >= m.viewport.h,
      `demo top ${Math.round(m.demo.top)} vs viewport ${m.viewport.h}`);
  }
  check(`${tag} input font >= 16px (no iOS zoom)`, m.inputFontPx >= 16, `${m.inputFontPx}px`);
  check(`${tag} ghost overlay font matches the input`, m.ghostFontPx === m.inputFontPx,
    `overlay ${m.ghostFontPx}px vs input ${m.inputFontPx}px`);
  check(`${tag} field carries the rest shadow`, /rgba/.test(m.fieldShadow) && m.fieldShadow !== "none");
  check(`${tag} demo panel carries the rest shadow`, /rgba/.test(m.demoShadow) && m.demoShadow !== "none");
  check(`${tag} generate button touch target >= 44px`, m.ctaHeight >= 44, `${Math.round(m.ctaHeight)}px`);

  if (vp.phone) {
    check(`${tag} button spans the field width`, m.cta.width > m.field.width * 0.8,
      `button ${Math.round(m.cta.width)} of field ${Math.round(m.field.width)}`);
    check(`${tag} field grows to two rows`, m.cta.top > m.field.top + 8, "button sits under the input");
  } else {
    check(`${tag} field is 60px tall`, Math.abs(m.field.height - 60) <= 1, `${Math.round(m.field.height)}px`);
    check(`${tag} button sits inside the field`, m.cta.right <= m.field.right && m.cta.top > m.field.top,
      `inset ${Math.round(m.field.right - m.cta.right)}px`);
    check(`${tag} hero block is centered`,
      Math.abs((m.h1.left - 0) - (m.viewport.w - m.h1.right)) < 80 || m.h1.width >= m.viewport.w - 80,
      "headline centered in its column");
  }

  check(`${tag} console clean`, errors.length === 0, errors.slice(0, 2).join(" | "));

  await page.screenshot({ path: `${DIR}/tier4-${vp.label}.png`, fullPage: true });
  if (vp.label === "desktop-1440") {
    await page.screenshot({ path: `${DIR}/tier4-first-viewport-1440.png`, fullPage: false });
  }
  await context.close();
}

// takes: a browser
// does: measures layout shift caused by the entrance animation, by comparing
//       element positions on the first frame with their settled positions
// returns: nothing (records results)
async function runCls(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto(`${BASE}/?skipIntro=1`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(HOME);
  await page.waitForTimeout(2000);
  const cls = await page.evaluate(() => window.__cls);
  check("entrance animation causes no layout shift", cls < 0.01, `CLS ${cls.toFixed(4)}`);

  const settled = await page.evaluate(() => {
    const s = getComputedStyle(document.querySelector("h1"));
    return { opacity: s.opacity, transform: s.transform };
  });
  check("headline settles opaque and untransformed", settled.opacity === "1" &&
    (settled.transform === "none" || settled.transform === "matrix(1, 0, 0, 1, 0, 0)"),
    `opacity ${settled.opacity}, transform ${settled.transform}`);
  await context.close();
}

// takes: a browser
// does: retypes into the rescaled field to confirm focus is never stolen, the
//       ghost completion still lands, and both query types still route
// returns: nothing (records results)
async function runBehavior(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/?skipIntro=1`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(HOME);

  const inputs = await page.locator(".dash-home input").count();
  check("exactly one search input on the homepage", inputs === 1, `${inputs} found`);

  const input = page.locator(".home-field input");
  await input.click();
  for (const ch of "Pfiz") {
    await page.keyboard.type(ch);
    await page.waitForTimeout(60);
  }
  const stillFocused = await page.evaluate(() =>
    document.activeElement === document.querySelector(".home-field input"));
  check("typing never steals focus from the field", stillFocused);

  // The ghost overlay renders the typed prefix transparent and the predicted
  // suffix gray, as two spans — so read the text content, not innerText, whose
  // span-per-line breaks would split "Pfiz" from "er".
  const ghostText = await page.locator(".home-field-text").first()
    .evaluate((el) => el.textContent || "").catch(() => "");
  check("ghost completion still appears at the new scale", /^pfizer/i.test(ghostText.replace(/\s+/g, "")),
    JSON.stringify(ghostText));

  await page.keyboard.press("Tab");
  const accepted = await input.inputValue();
  check("Tab accepts the completion", /^Pfizer/i.test(accepted), accepted);

  await page.keyboard.press("Enter");
  await page.waitForTimeout(2500);
  const companyView = await page.evaluate(() =>
    !!document.querySelector('.ws-nav-item.active')?.textContent?.match(/Companies/i));
  check("a company query still routes to Companies", companyView);

  // Back to Home for the sector query.
  await page.getByRole("button", { name: /^Home$/ }).first().click();
  await page.waitForTimeout(400);
  await page.locator(".home-field input").fill("oncology");
  await page.locator(".home-cta").click();
  await page.waitForTimeout(2500);
  const sectorView = await page.evaluate(() =>
    !!document.querySelector('.ws-nav-item.active')?.textContent?.match(/Sectors/i));
  check("a sector query still routes to Sectors", sectorView);

  await context.close();
}

// takes: a browser
// does: loads the page with reduced motion forced and confirms the hero is
//       fully visible with nothing animating
// returns: nothing (records results)
async function runReducedMotion(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/?skipIntro=1`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(HOME);
  await page.waitForTimeout(300);
  const state = await page.evaluate(() => {
    const els = [document.querySelector("h1"), document.querySelector(".home-sub"), document.querySelector(".home-field")];
    return els.map((el) => {
      const s = getComputedStyle(el);
      return { opacity: s.opacity, animationName: s.animationName };
    });
  });
  check("reduced motion: hero visible immediately",
    state.every((s) => s.opacity === "1"), JSON.stringify(state.map((s) => s.opacity)));
  check("reduced motion: no entrance animation runs",
    state.every((s) => s.animationName === "none"), JSON.stringify(state.map((s) => s.animationName)));
  await context.close();
}

// takes: a browser
// does: walks the hero with the keyboard only, confirming the field and the
//       generate button are both reachable and show a visible focus state
// returns: nothing (records results)
async function runKeyboard(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/?skipIntro=1`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(HOME);
  await page.evaluate(() => document.activeElement?.blur());

  let reachedField = false;
  for (let i = 0; i < 25 && !reachedField; i++) {
    await page.keyboard.press("Tab");
    reachedField = await page.evaluate(() =>
      document.activeElement === document.querySelector(".home-field input"));
  }
  check("keyboard-only walk reaches the search field", reachedField);
  // Let React flush the focus-triggered state update before reading style —
  // the native focus event lands a tick before setFocused(true) re-renders.
  await page.waitForTimeout(100);

  const ring = await page.evaluate(() => {
    const f = document.querySelector(".home-field");
    return getComputedStyle(f).boxShadow;
  });
  check("focused field shows the accent ring", /122, 255|0, 122/.test(ring), ring.slice(0, 60));

  await page.locator(".home-field input").fill("Pfizer");
  await page.keyboard.press("Tab");
  const onButton = await page.evaluate(() =>
    document.activeElement === document.querySelector(".home-cta"));
  check("Tab from a filled field reaches Generate report", onButton);
  await context.close();
}

// takes: a browser
// does: loads the homepage in a real WebKit-family iPhone profile to confirm
//       Safari's own rendering of the rescaled field
// returns: nothing (records results)
async function runWebkit(vpLabel) {
  const { webkit } = await import("playwright");
  const browser = await webkit.launch({ headless: true });
  const context = await browser.newContext(devices["iPhone 14 Pro"]);
  const page = await context.newPage();
  await page.goto(`${BASE}/?skipIntro=1`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(HOME);
  await page.waitForTimeout(1000);
  const m = await page.evaluate(() => {
    const f = document.querySelector(".home-field");
    const i = document.querySelector(".home-field input");
    return {
      inputFont: parseFloat(getComputedStyle(i).fontSize),
      scrollW: document.documentElement.scrollWidth,
      inner: window.innerWidth,
      fieldW: f.getBoundingClientRect().width,
    };
  });
  check(`[webkit-iphone] input font >= 16px`, m.inputFont >= 16, `${m.inputFont}px`);
  check(`[webkit-iphone] no horizontal scroll`, m.scrollW <= m.inner + 1, `${m.scrollW} vs ${m.inner}`);
  await page.screenshot({ path: `${DIR}/tier4-webkit-iphone.png`, fullPage: true });
  await browser.close();
}

mkdirSync(DIR, { recursive: true });
const browser = await chromium.launch({ headless: false });
for (const vp of VIEWPORTS) await runViewport(browser, vp);
await runCls(browser);
await runBehavior(browser);
await runReducedMotion(browser);
await runKeyboard(browser);
await browser.close();
await runWebkit();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("FAILED:\n" + failed.map((f) => `  - ${f.name}`).join("\n"));
  process.exit(1);
}
