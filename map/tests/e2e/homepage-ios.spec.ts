import { test, expect, devices, Page } from '@playwright/test';
import { mockBackend, gotoWorkspace } from './helpers';

/**
 * The homepage on the widths iOS actually reports, driven by real taps.
 *
 * Two things this catches that the main suite cannot:
 *
 *   1. Touch has no hover. iOS synthesizes pointerenter and focus before it
 *      sends a click, so an interaction built on hover can highlight a record
 *      and clear it again in the same tap — leaving the diagram decorative on
 *      every phone and tablet while every desktop test still passes.
 *   2. Too SMALL is a failure mode. Checking only for horizontal overflow
 *      passes a diagram scaled down until its labels are unreadable, which is
 *      how a stray max-width cap reached production.
 *
 * Run against WebKit — that is the engine on every iPhone and iPad, whichever
 * browser is installed:  npx playwright test --project=webkit homepage-ios
 */

/** The widths iOS reports, and what each one is. */
const IOS_WIDTHS = [
  { width: 390, height: 844, label: 'iPhone 14/15/16 portrait' },
  { width: 430, height: 932, label: 'iPhone Pro Max portrait' },
  { width: 932, height: 430, label: 'iPhone 16 Pro Max landscape' },
  { width: 834, height: 1194, label: 'iPad portrait' },
  { width: 1024, height: 768, label: 'iPad landscape' },
  { width: 1366, height: 1024, label: 'iPad Pro landscape' },
];

/** Below this a mono record name stops being comfortably readable. */
const MIN_LABEL_PX = 11;

// A real touchscreen: no mouse, no hover, taps dispatch touch events.
test.use({ ...devices['iPhone 14'], viewport: { width: 390, height: 844 } });

/**
 * takes a page showing the homepage
 * measures the diagram's rendered size and the on-screen size of its labels
 * returns the layout mode, the effective label size, and the column fill ratio
 */
async function measureDiagram(page: Page) {
  return page.evaluate(() => {
    const svg = document.querySelector('.v4-diagram') as SVGElement;
    const column = svg.closest('.v4-container') as HTMLElement;
    const rendered = svg.getBoundingClientRect().width;
    const viewBoxWidth = Number((svg.getAttribute('viewBox') || '0 0 1 1').split(' ')[2]);
    const label = document.querySelector('.v4-node-label') as SVGTextElement;
    const authoredPx = parseFloat(getComputedStyle(label).fontSize);
    return {
      mode: svg.getAttribute('data-layout'),
      rendered,
      column: column.getBoundingClientRect().width,
      // The SVG scales to its box, so a label's real size on screen is its
      // authored size times that scale — not the value in the stylesheet.
      effectiveLabelPx: authoredPx * (rendered / viewBoxWidth),
    };
  });
}

for (const { width, height, label } of IOS_WIDTHS) {
  test.describe(`${width}x${height} — ${label}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height });
      await mockBackend(page);
      await gotoWorkspace(page);
      await page.locator('#provenance').scrollIntoViewIfNeeded();
    });

    test('has no horizontal scroll', async ({ page }) => {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(700);

      const overflow = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        win: window.innerWidth,
        offenders: Array.from(document.querySelectorAll('.v4-page *'))
          .map((el) => ({
            tag: el.tagName + '.' + (typeof el.className === 'string' ? el.className : ''),
            right: el.getBoundingClientRect().right,
          }))
          .filter((e) => e.right > window.innerWidth + 1)
          .slice(0, 5),
      }));

      expect(overflow.offenders).toEqual([]);
      expect(overflow.doc).toBeLessThanOrEqual(overflow.win);
    });

    test('renders the diagram legibly', async ({ page }) => {
      const m = await measureDiagram(page);
      expect(
        m.effectiveLabelPx,
        `record labels render at ${m.effectiveLabelPx.toFixed(1)}px in ${m.mode} mode`,
      ).toBeGreaterThanOrEqual(MIN_LABEL_PX);
      // And the wide arrangement must still fill its column rather than sitting
      // in it as a postage stamp.
      if (m.mode === 'wide') expect(m.rendered / m.column).toBeGreaterThanOrEqual(0.7);
    });

    test('a real tap highlights a record and swaps the caption', async ({ page }) => {
      const caption = page.getByTestId('provenance-caption');
      await expect(caption).toContainText('Every claim in the brief resolves');

      // A genuine touch tap — touchstart/touchend, plus whatever mouse and
      // focus events WebKit synthesizes around them. Not a dispatched click.
      await page.getByTestId('provenance-node-1').tap();

      await expect(caption).toContainText('Interventional studies matched on sponsor');
      await expect(page.getByTestId('provenance-node-1')).toHaveAttribute('data-active', 'true');
      await expect(page.getByTestId('provenance-path-1')).toHaveAttribute('data-state', 'active');
      await expect(page.getByTestId('provenance-path-0')).toHaveAttribute('data-state', 'dimmed');
    });

    test('tapping a second record moves the highlight to it', async ({ page }) => {
      const caption = page.getByTestId('provenance-caption');
      await page.getByTestId('provenance-node-0').tap();
      await expect(caption).toContainText('Financial statements from XBRL');

      await page.getByTestId('provenance-node-3').tap();
      await expect(caption).toContainText('Active federally funded projects');
      await expect(page.getByTestId('provenance-node-3')).toHaveAttribute('data-active', 'true');
      await expect(page.getByTestId('provenance-node-0')).toHaveAttribute('data-active', 'false');
    });
  });
}

test.describe('touch: the rest of the page', () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page);
    await gotoWorkspace(page);
  });

  test('a chip fills the field and reads it on tap', async ({ page }) => {
    test.setTimeout(60000);
    await page.getByRole('button', { name: 'Oncology', exact: true }).tap();
    await expect(page.locator('.v4-page input[placeholder="Pfizer"]')).toHaveValue('Oncology');
  });

  test('the Read button submits on tap', async ({ page }) => {
    test.setTimeout(60000);
    await page.locator('.v4-page input[placeholder="Pfizer"]').fill('Apple');
    await page.getByRole('button', { name: 'Read', exact: true }).tap();
    await expect(
      page.locator('nav[aria-label="Workspace views"] .v4-nav-link[aria-current="page"]'),
    ).toHaveText('Companies', { timeout: 20000 });
  });
});
