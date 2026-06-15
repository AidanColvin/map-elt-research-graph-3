import { expect, Page } from '@playwright/test';

/**
 * ───────────────────────────────────────────────────────────────────────────
 * CI-safe network mocking
 * ───────────────────────────────────────────────────────────────────────────
 * In CI there is no Firebase env (the app uses its keyless localStorage auth
 * fallback) and no real research backend. The frontend calls a handful of
 * endpoints that, unmocked, would either hang, hit the network, or return
 * non-deterministic data:
 *
 *   - GET  /api/generate            → curated companies stream from disk, so
 *                                      this works offline already and is left
 *                                      untouched (it never reaches the network).
 *   - POST /api/run-pipeline-stream → SSE sector-scan progress + final report,
 *                                      proxied to the live backend.
 *   - POST /api/run-pipeline        → non-streaming fallback ({ data }).
 *   - POST /api/partnerships        → UNC partnership lookup.
 *   - GET  /api/freshness           → saved-report freshness signature.
 *
 * It also renders company logos/avatars from external hosts (Google favicons,
 * DuckDuckGo, ui-avatars.com, Clearbit). We abort those so a test never depends
 * on third-party availability.
 *
 * `mockBackend(page)` installs all of the above. Call it BEFORE `gotoWorkspace`
 * so the routes are armed before the app makes any request. Note: it is applied
 * per-test (never global), so specs that intentionally exercise the real proxy
 * validation (security.spec.ts) are unaffected.
 */

/** A small, schema-valid sector ReportData fixture. */
export function sectorFixture(sector: string) {
  return {
    report_meta: {
      sector,
      date: '2026-06-14',
      generated_at: '2026-06-14T12:00:00.000Z',
      prepared_by: 'Map (test)',
      version: 'v-test',
    },
    section1_overview: {
      definition: { text: `${sector} overview for testing.`, sources: ['https://www.sec.gov/x'] },
      scale: { text: 'A sizable test market.', sources: [] },
      why_now: [{ signal: 'Test tailwind', sources: [] }],
      nc_context: { text: 'NC test context.', sources: [] },
      unc_units: [{ unit: 'UNC Test Center', focus: 'Testing', url: 'https://unc.edu' }],
    },
    section2_internal_mapping: {
      known_partnerships: [],
      unc_faculty: [],
      data_assets: [],
      risk_flags: [],
    },
    section3_selection: { selected: [], excluded: [] },
    section4_profiles: [
      {
        company_name: 'Testco Therapeutics',
        sector_tag: sector,
        nc_based: true,
        overview: { text: 'A representative company in this sector.', sources: [] },
        partnership_type: 'Research',
        existing_unc_tie: true,
        facts: {},
        pipeline: [],
        partnering_history: [],
        unc_alignment: [],
        what_unc_offers: [],
        signals: [],
        unc_alumni: [],
      },
      {
        company_name: 'Acme Bio',
        sector_tag: sector,
        nc_based: false,
        overview: { text: 'Another representative company.', sources: [] },
        partnership_type: 'Licensing',
        existing_unc_tie: false,
        facts: {},
        pipeline: [],
        partnering_history: [],
        unc_alignment: [],
        what_unc_offers: [],
        signals: [],
        unc_alumni: [],
      },
    ],
    section5_value_prop: {
      data_assets: [],
      research_capacity: [],
      talent_pipeline: [],
      nc_access: [],
      future_signals: [],
      partnership_models: [],
    },
    section6_talking_points: { sector_opening: { text: 'Opening line.', sources: [] }, companies: [] },
    section7_verification: [{ label: 'Test check', checked: true }],
    references: [
      { id: 1, title: 'Test reference', year: '2026', publisher: 'SEC', url: 'https://www.sec.gov/x' },
    ],
    _validation: { total_claims: 3, verified: 3, unverified: 0, issues: [] },
    _meta: { resolution: 'discovered', generated_at: '2026-06-14T12:00:00.000Z' },
  };
}

/**
 * Build the SSE body the frontend's `parseSseFrames` expects: "\n\n"-delimited
 * frames, each a single `data:` line of JSON. Ends with a `done` event whose
 * `report` is the full ReportData.
 */
function sectorSseBody(sector: string): string {
  const fixture = sectorFixture(sector);
  const total = fixture.section4_profiles.length;
  const frame = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;
  return (
    frame({ type: 'stage', key: 'resolved', total }) +
    frame({ type: 'progress', done: 1, total }) +
    frame({ type: 'progress', done: total, total }) +
    frame({ type: 'stage', key: 'building' }) +
    frame({ type: 'done', report: fixture })
  );
}

/**
 * Install deterministic, offline mocks for every backend endpoint + external
 * image host. Call before navigating.
 */
export async function mockBackend(page: Page): Promise<void> {
  // ── Strip the app's Content-Security-Policy from HTML document responses ──
  // The Next.js *dev server* (what `npm run dev` runs, including in CI) uses
  // `eval()` for React Refresh / HMR, but the app's CSP (next.config.mjs) sets
  // `script-src` WITHOUT `'unsafe-eval'`. Under dev that blocks hydration
  // entirely — the page freezes on the intro splash and nothing is interactive,
  // so every test would time out before reaching the workspace. We cannot touch
  // app source, so we remove the CSP header from the navigated document at the
  // test layer (production builds don't use eval, so this only affects the dev
  // server the tests run against). Only document responses are rewritten.
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback();
    try {
      const resp = await route.fetch();
      const headers = { ...resp.headers() };
      delete headers['content-security-policy'];
      delete headers['content-security-policy-report-only'];
      await route.fulfill({ response: resp, headers, body: await resp.body() });
    } catch {
      await route.fallback();
    }
  });

  // Abort external logo / avatar hosts so tests never hit the network for them.
  await page.route(
    /(google\.com\/s2\/favicons|icons\.duckduckgo\.com|ui-avatars\.com|logo\.clearbit\.com|clearbit\.com)/,
    (route) => route.abort(),
  );

  // Company deep dive — GET /api/generate?company=... streams plain-text
  // markdown. Curated companies (Apple, NVIDIA, Microsoft) stream from disk and
  // work offline, but live companies hit SEC/Wikipedia/OpenAlex. We return a
  // deterministic, board-ready markdown report for ANY company so deep dives are
  // fast and offline regardless of whether the subject is curated.
  await page.route('**/api/generate**', async (route) => {
    const url = new URL(route.request().url());
    const company = (url.searchParams.get('company') || 'Company').trim();
    await route.fulfill({
      status: 200,
      contentType: 'text/plain; charset=utf-8',
      body: companyMarkdown(company),
    });
  });

  // Sector scan — streaming SSE path (preferred by the frontend).
  await page.route('**/api/run-pipeline-stream', async (route) => {
    const sector = readSector(route.request().postData());
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream; charset=utf-8',
      body: sectorSseBody(sector),
    });
  });

  // Sector scan — non-streaming fallback ({ data: ReportData }).
  await page.route('**/api/run-pipeline', async (route) => {
    const sector = readSector(route.request().postData());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: sectorFixture(sector) }),
    });
  });

  // Partnership lookup.
  await page.route('**/api/partnerships', async (route) => {
    // Query-aware so the typo-resolution specs (which assert different resolved
    // names + SEC verbatim per query) and the new partner-depth specs all pass
    // against the same offline mock.
    const posted = (() => { try { return route.request().postDataJSON(); } catch { return null; } })();
    const q = String(posted?.query ?? '').toLowerCase();

    if (q.includes('liquidia')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            query: 'Liquidia',
            resolved_name: 'Liquidia Corp',
            type: 'company',
            links: {
              pubmed: 'https://pubmed.ncbi.nlm.nih.gov/?term=Liquidia',
              edgar: 'https://www.sec.gov/cgi-bin/browse-edgar?company=liquidia&type=10-K',
              unc_web: 'https://www.google.com/search?q=site:unc.edu+Liquidia',
            },
            clinical: { count: 3, top_authors: ['Hickey AJ'], papers: [{ pmid: '40000001', title: 'Inhaled treprostinil dry powder — UNC formulation work.', authors: ['Hickey AJ'], journal: 'JPharmSci', year: '2025', url: 'https://pubmed.ncbi.nlm.nih.gov/40000001/' }] },
            coi: { count: 0, papers: [], window_years: 5 },
            unc_units: [{ unit: 'UNC Eshelman School of Pharmacy', count: 3 }],
            financial: {
              quotes: [{ text: 'Our technology originated from research conducted at the University of North Carolina at Chapel Hill.', filing_url: 'https://www.sec.gov/x' }],
              filing_url: 'https://www.sec.gov/x',
            },
            ecosystem: [],
            nih_grants: [],
            nih_pis: [],
            trials: [],
            trials_total: 6,
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          query: 'Eli Lilly',
          resolved_name: 'ELI LILLY & Co',
          type: 'company',
          links: {
            pubmed: 'https://pubmed.ncbi.nlm.nih.gov/?term=Eli+Lilly',
            edgar: 'https://www.sec.gov/cgi-bin/browse-edgar?company=eli+lilly&type=10-K',
            unc_web: 'https://www.google.com/search?q=site:unc.edu+Eli+Lilly',
          },
          clinical: {
            count: 8,
            top_authors: ["D'Alessio D", 'Bhatt DL', "O'Shaughnessy J"],
            papers: [
              {
                pmid: '42191907',
                title: 'A novel ex vivo platform for functional evaluation of treatment responses in metastatic ovarian cancer.',
                authors: ["D'Alessio D"],
                journal: 'JAMIA',
                year: '2026',
                url: 'https://pubmed.ncbi.nlm.nih.gov/42191907/',
              },
            ],
          },
          coi: { count: 1, papers: [{ pmid: '42114520', title: 'SURPASS-CVOT trial.', authors: ['Bhatt DL'], journal: 'NEJM', year: '2026', url: 'https://pubmed.ncbi.nlm.nih.gov/42114520/' }], window_years: 5 },
          unc_units: [
            { unit: 'UNC Lineberger Comprehensive Cancer Center', count: 2 },
          ],
          financial: { quotes: [], filing_url: '' },
          ecosystem: [],
          nih_grants: [
            {
              project_num: '5R01CA123456-03',
              title: 'GLP-1 receptor agonists in pancreatic cancer prevention',
              pi: "D'Alessio D",
              department: 'Medicine',
              fiscal_year: 2025,
              url: 'https://reporter.nih.gov/project-details/5R01CA123456-03',
            },
          ],
          nih_pis: [
            {
              name: "D'Alessio D",
              org: 'UNC School of Medicine — Medicine',
              project_title: 'GLP-1 receptor agonists in pancreatic cancer prevention',
              grant_url: 'https://reporter.nih.gov/project-details/5R01CA123456-03',
            },
          ],
          trials: [
            {
              nct_id: 'NCT05000000',
              title: 'SURPASS-CVOT: Tirzepatide vs Dulaglutide in T2D',
              phase: 'Phase 3',
              status: 'COMPLETED',
              lead_sponsor: 'Eli Lilly and Company',
              collaborators: ['University of North Carolina at Chapel Hill'],
              unc_signal: 'University of North Carolina at Chapel Hill',
              url: 'https://clinicaltrials.gov/study/NCT05000000',
            },
          ],
          trials_total: 47,
        },
      }),
    });
  });

  // Freshness signature (saved-report re-verification).
  await page.route('**/api/freshness**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ sig: 'test-sig' }),
    });
  });
}

/** Deterministic, board-ready deep-dive markdown for any company. */
function companyMarkdown(company: string): string {
  // The Company canvas derives its title from the leading "# <name>" line, so
  // keep the H1 exactly the company name (tests assert an exact "Apple" heading).
  return [
    `# ${company}`,
    '',
    `_${company} — Partnership Profile (test fixture)_`,
    '',
    '## Executive Summary',
    '',
    `${company} is a publicly traded company analyzed here as a potential research`,
    `partner for UNC Chapel Hill. This profile is generated from SEC filings and`,
    `public sources. ${company} has meaningful scale and a track record relevant to`,
    `university collaboration, making it a credible partnership prospect.`,
    '',
    '## Company Overview',
    '',
    `${company} operates across several business lines. The figures below are`,
    `illustrative test data used to validate the report rendering pipeline.`,
    '',
    '- Headquarters: Test City, USA',
    `- Leadership: ${company} executive team`,
    '- Public filer: Yes (SEC EDGAR)',
    '',
    '## Why UNC',
    '',
    `UNC Chapel Hill brings research capacity, clinical infrastructure, and a talent`,
    `pipeline that align with ${company}'s priorities. Several UNC units could anchor`,
    `a first collaboration.`,
    '',
    '## Sources',
    '',
    '1. US Securities and Exchange Commission. EDGAR. https://www.sec.gov/x',
    '',
  ].join('\n');
}

function readSector(postData: string | null): string {
  if (!postData) return 'Test Sector';
  try {
    return (JSON.parse(postData).sector as string) || 'Test Sector';
  } catch {
    return 'Test Sector';
  }
}

/**
 * Shared end-to-end helpers for the Map workspace.
 *
 * The app boots through two gates before the workspace is reachable:
 *   1. An animated intro splash (`components/Intro.tsx`) that auto-advances
 *      after ~5s but is also click-to-skip (the whole <main> has an onClick).
 *   2. An auth gate (`components/AuthGate.tsx`) offering email/password OR a
 *      "Continue as guest" button. Tests have no credentials, so we always take
 *      the guest path, which exercises the exact same workspace shell.
 *
 * `gotoWorkspace` drives past both and resolves once the workspace top-nav is
 * on screen, so every spec can start from a known, authenticated state.
 */

export const BASE = 'http://localhost:3000';

/**
 * Navigate to the app, skip the intro splash, sign in as a guest, and wait for
 * the workspace nav to render. Resilient to whichever gate appears first.
 */
export async function gotoWorkspace(page: Page): Promise<void> {
  // `networkidle` is unreliable against the Next dev server (its HMR websocket
  // keeps the network "busy"), so wait on DOM content instead.
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  const intro = page.locator('main[title="Click to skip"]');
  const guest = page.getByRole('button', { name: /continue as guest/i });
  const nav = page.locator('nav').first();

  // The intro splash auto-advances ~1s after React hydrates, and is also
  // click-to-skip. Against a cold dev server the page can be served as static
  // HTML before hydration, so a single early click lands on a not-yet-wired
  // handler and does nothing (and the auto-advance timer hasn't registered
  // either). Poll: keep nudging the intro until the auth gate or workspace nav
  // actually appears, so we're resilient to slow hydration.
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await guest.isVisible().catch(() => false)) break;
    if (await nav.isVisible().catch(() => false)) break;
    if (await intro.isVisible().catch(() => false)) {
      await intro.click({ timeout: 2000 }).catch(() => {});
    }
    await page.waitForTimeout(500);
  }

  if (await guest.isVisible().catch(() => false)) {
    await guest.click();
  }

  await nav.waitFor({ state: 'visible', timeout: 20000 });
}

/**
 * Map keeps every workspace view mounted and toggles `display`, so a bare
 * locator can resolve to a hidden element in an inactive view. Scope
 * interactions to the currently-visible `.ws-view` to avoid that.
 */
export function visibleView(page: Page) {
  return page.locator('.ws-view:visible');
}

/**
 * Click a top-nav tab by its visible label (e.g. "Dashboard",
 * "Company Profile", "Sector Scan"). The tabs are buttons inside the
 * "Workspace views" <nav>.
 */
export async function clickNav(page: Page, label: string): Promise<void> {
  await page.locator('nav[aria-label="Workspace views"]').getByRole('button', { name: label, exact: true }).click();
}

/**
 * Open the Account view via the right-hand Profile button (this is the only
 * route to the "Accounts" view; it is intentionally not a nav tab).
 */
export async function openProfile(page: Page): Promise<void> {
  // The header profile control's accessible name is "<initial> Account" (e.g.
  // "A Account" — the avatar initial plus the label), so match on "Account".
  await page.locator('header, nav').getByRole('button', { name: /account/i }).first().click();
}

/** Assert the page has logged no console errors collected by `attachConsole`. */
export function attachConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}
