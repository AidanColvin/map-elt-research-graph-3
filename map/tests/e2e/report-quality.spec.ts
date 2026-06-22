/**
 * Report-quality E2E — drives the Projects partnership report in real Chrome with
 * deliberately CONTAMINATED backend data and asserts the frontend gating holds:
 *
 *   - non-health sectors strip ClinicalTrials.gov sponsor-name-collision content
 *     (clinical pipeline / GOAL titles) and route to non-health data assets;
 *   - weak backend talking points (8-K filler, revenue restatement, clinical
 *     boilerplate) are replaced by a synthesized, logical argument;
 *   - the removed "UNC alignment signals by company" chart stays gone;
 *   - health sectors KEEP clinical content + clinical data assets;
 *   - the report has no horizontal overflow on mobile and the nav doesn't overlap.
 *
 * These codify the manual Chrome QA done across the sector-report work.
 */
import { test, expect, Page } from '@playwright/test';
import { mockBackend, installSectorMock, sectorFixture, gotoWorkspace, clickNav, visibleView } from './helpers';

// A profile whose ClinicalTrials.gov rows are sponsor-name collisions (the trial
// title carries no clinical keyword) plus the weak talking points the backend
// emits. report_meta.sector drives the health domain.
function contaminatedFixture(sector: string) {
  const f: any = sectorFixture(sector);
  f.report_meta.sector = sector;
  f.section4_profiles = [
    {
      company_name: 'Globex Media',
      sector_tag: sector, nc_based: false,
      overview: { text: 'A representative company.', sources: [] },
      partnership_type: 'Strategic', existing_unc_tie: true,
      facts: {
        ticker: { value: 'GLBX (Nasdaq)' },
        sic: { value: 'Cable & Other Pay Television Services' },
        revenue: { value: '$50.0B (FY2025)' },
        rd_expense: { value: '$2.0B (FY2025)' },
        total_assets: { value: '$120.0B' },
      },
      // Sponsor-name collision: an "Amazon University" style trial title.
      pipeline: [{ program: 'Hemodynamic Repercussions in Different Therapeutic Positions in Premature Newborn', stage: 'completed', sources: ['https://clinicaltrials.gov/study/NCT1'] }],
      partnering_history: [],
      unc_alignment: [{ company_program: 'Hemodynamic Repercussions in Different Therapeutic Positions in Premature Newborn', unc_unit: 'UNC Chapel Hill', rationale: 'A UNC investigator is federally funded on overlapping topics.', sources: ['https://reporter.nih.gov/x'] }],
      what_unc_offers: [], signals: [], unc_alumni: [],
      partnership_term_count: 26, collaboration_8k_count: 0,
    },
    {
      company_name: 'Initech Streaming',
      sector_tag: sector, nc_based: false,
      overview: { text: 'A second company (for the R&D peer chart).', sources: [] },
      partnership_type: 'Translational', existing_unc_tie: false,
      facts: { ticker: { value: 'INI (Nasdaq)' }, sic: { value: 'Services-Prepackaged Software' }, revenue: { value: '$10.0B (FY2025)' }, rd_expense: { value: '$1.0B (FY2025)' } },
      pipeline: [], partnering_history: [], unc_alignment: [], what_unc_offers: [], signals: [], unc_alumni: [],
      partnership_term_count: 5, collaboration_8k_count: 0,
    },
  ];
  f.section6_talking_points = {
    sector_opening: { text: 'Opening line.', sources: [] },
    companies: [{
      company: 'Globex Media',
      unc_hook: { text: "UNC's Jane Roe co-authored published work with Globex in 2026; a baseline relationship is already on the public record.", sources: [] },
      know_pipeline: { text: 'Globex has no active ClinicalTrials.gov entries; pipeline detail in 10-K Item 1.', sources: [] },
      know_moves: { text: 'Globex filed its most recent 8-K on 2026-06-12 (material event disclosure).', sources: [] },
      know_company: { text: 'GLOBEX MEDIA reported FY2025 revenue of $50.0B.', sources: [] },
    }],
  };
  return f;
}

async function runSector(page: Page, sector: string) {
  const fixture = contaminatedFixture(sector);
  await mockBackend(page);
  await installSectorMock(page, fixture); // override with the contaminated fixture

  await gotoWorkspace(page);
  await clickNav(page, 'Projects');
  const view = visibleView(page);
  const input = view.getByLabel('New project name');
  await expect(input).toBeVisible({ timeout: 10000 });
  await input.fill(sector);
  await view.getByTestId('create-project').click();
  await expect(view.getByTestId('run-pipeline')).toBeVisible({ timeout: 10000 });
  await view.getByLabel('Pipeline subject').fill(sector);
  await view.getByTestId('run-pipeline').click();
  await expect(view.getByTestId('pipeline-results')).toBeVisible({ timeout: 30000 });
  await expect(view.getByTestId('save-run')).toBeVisible({ timeout: 90000 });
  // The partnership report (data assets) confirms the rich render is on screen.
  await expect(page.getByText('UNC data assets available to partners', { exact: false })).toBeVisible({ timeout: 15000 });
  return page.locator('body').innerText();
}

test('non-health sector: clinical contamination + weak filler are gated out', async ({ page }) => {
  test.setTimeout(150000);
  const body = await runSector(page, 'Streaming');

  // Clinical collision titles never reach Focus / pipeline / GOAL.
  expect(body).not.toContain('Hemodynamic Repercussions');
  expect(body).not.toContain('Premature Newborn');
  expect(body).not.toMatch(/Clinical pipeline ·/);

  // Weak backend talking points are dropped.
  expect(body).not.toContain('material event disclosure');
  expect(body).not.toMatch(/reported FY\d* revenue of/i);
  expect(body).not.toContain('no active ClinicalTrials.gov entries');

  // The removed alignment chart stays gone.
  expect(body).not.toContain('UNC alignment signals by company');

  // Right (non-health) data assets; no clinical ones.
  expect(body).toContain('RENCI');
  expect(body).not.toContain('Lineberger');
  expect(body).not.toContain('Carolina Health Informatics');

  // Synthesized, company-specific talking points are present (not boilerplate):
  // the co-authored-publication tie, the R&D-budget capacity line, and the
  // 10-K partnership-posture line (count-driven).
  expect(body).toMatch(/Partnerships cited \d+/);
  expect(body).toMatch(/R&D budget|Co-authored UNC publication/);
});

test('health sector: clinical content + clinical data assets are preserved', async ({ page }) => {
  test.setTimeout(150000);
  const body = await runSector(page, 'Oncology');

  // Health sectors keep the clinical framing and clinical data assets.
  expect(body).toContain('Lineberger');
  expect(body).toMatch(/Clinical pipeline ·/);
});

test('mobile: report has no horizontal overflow and the nav does not overlap', async ({ page }) => {
  test.setTimeout(150000);
  await page.setViewportSize({ width: 375, height: 812 });
  await runSector(page, 'Streaming');

  // No horizontal overflow at phone width.
  const overflow = await page.evaluate(() => {
    const el = document.scrollingElement || document.documentElement;
    return el.scrollWidth - el.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);

  // The logo must not overlap the nav. (The nav scrolls internally, so the
  // first tab can be scrolled off-screen — measure the nav CONTAINER, whose box
  // is fixed, against the logo's right edge.)
  const logo = page.getByRole('button', { name: /Map home/i });
  const nav = page.locator('nav[aria-label="Workspace views"]');
  const lb = await logo.boundingBox();
  const nb = await nav.boundingBox();
  expect(lb && nb).toBeTruthy();
  if (lb && nb) expect(lb.x + lb.width).toBeLessThanOrEqual(nb.x + 1);
});
