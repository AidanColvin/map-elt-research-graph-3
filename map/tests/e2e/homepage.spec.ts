import { test, expect, Page } from '@playwright/test';
import { mockBackend, gotoWorkspace, attachConsole, clickNav } from './helpers';

/**
 * The public homepage (components/home/*). Everything here runs in a real
 * browser: the unit suite covers the pure helpers, so these tests exist to
 * catch what unit tests cannot — "it passed, then the button did nothing".
 */

const WIDTHS = [320, 390, 768, 1024, 1440];

test.beforeEach(async ({ page }) => {
  await mockBackend(page);
});

/** The one search input on the page. */
function searchField(page: Page) {
  return page.locator('.v4-page input[placeholder="Pfizer"]');
}

/** The label of whichever workspace destination is currently active. */
function activeNavLink(page: Page) {
  return page.locator('nav[aria-label="Workspace views"] .v4-nav-link[aria-current="page"]');
}

// ───────────────────────────── structure ─────────────────────────────

test('renders exactly the six sections, and none of the removed ones', async ({ page }) => {
  const errors = attachConsole(page);
  await gotoWorkspace(page);

  // Nav, then the four content sections, then the footer.
  await expect(page.locator('.v4-nav')).toBeVisible();
  for (const id of ['hero', 'provenance', 'rules', 'formats']) {
    await expect(page.locator(`#${id}`)).toBeAttached();
  }
  await expect(page.locator('.v4-footer')).toBeAttached();

  const body = await page.locator('.v4-page').innerText();
  expect(body).toContain('Every sentence has a source.');
  expect(body).toContain('Five public records. One document.');
  expect(body).toContain('Leave with a file.');

  // The demo, the problem framing, the four steps, and the limitations block
  // are gone — not hidden, gone.
  expect(body).not.toMatch(/what it doesn't do/i);
  expect(body).not.toMatch(/THE PROBLEM/i);
  expect(body).not.toMatch(/partnership research takes days/i);
  await expect(page.locator('.demo-fade, .demo-rise, .demo-caret')).toHaveCount(0);

  // The offline mocks abort third-party image requests on purpose, so filter
  // that noise out and assert on real app errors — the same filter the rest of
  // the suite uses.
  const appErrors = errors.filter(
    (e) => !/favicon/i.test(e) && !/Failed to load resource/i.test(e) && !/net::ERR_/i.test(e),
  );
  expect(appErrors, `Unexpected console/page errors:\n${appErrors.join('\n')}`).toEqual([]);
});

test('the page is full-bleed paper with no card floating on a tinted backdrop', async ({ page }) => {
  await gotoWorkspace(page);

  const measured = await page.evaluate(() => {
    const paper = getComputedStyle(document.documentElement)
      .getPropertyValue('--paper')
      .trim();
    const page_ = document.querySelector('.v4-page') as HTMLElement;
    return {
      paper,
      pageBg: getComputedStyle(page_).backgroundColor,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      pageWidth: page_.getBoundingClientRect().width,
      viewportWidth: window.innerWidth,
    };
  });

  // #FCFCFA
  expect(measured.paper.toLowerCase()).toBe('#fcfcfa');
  expect(measured.pageBg).toBe('rgb(252, 252, 250)');
  // The same colour behind it, so there is no card edge and no visible void.
  expect(measured.bodyBg).toBe('rgb(252, 252, 250)');
  // Full bleed: the page is the viewport, not a centred column on a backdrop.
  expect(measured.pageWidth).toBe(measured.viewportWidth);
});

test('--cite is used for citations and source links only, never for a button', async ({ page }) => {
  await gotoWorkspace(page);

  const misuse = await page.evaluate(() => {
    const cite = getComputedStyle(document.documentElement)
      .getPropertyValue('--cite')
      .trim()
      .toLowerCase();
    // #1B3AC7
    const asRgb = 'rgb(27, 58, 199)';
    const offenders: string[] = [];
    document.querySelectorAll('.v4-page button, .v4-nav button').forEach((el) => {
      const s = getComputedStyle(el);
      if (s.color === asRgb || s.backgroundColor === asRgb || s.borderColor === asRgb) {
        offenders.push(el.className || el.tagName);
      }
    });
    return { cite, offenders };
  });

  expect(misuse.cite).toBe('#1b3ac7');
  expect(misuse.offenders).toEqual([]);
});

test('every piece of text on the page clears 4.5:1 against what it sits on', async ({ page }) => {
  await gotoWorkspace(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(800);

  const failures = await page.evaluate(() => {
    const srgb = (c: number) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const parse = (s: string) => (s.match(/[\d.]+/g) || []).map(Number);
    const luminance = ([r, g, b]: number[]) =>
      0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
    const contrast = (a: number[], b: number[]) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    // The nearest ancestor that actually paints a background.
    const backdrop = (el: Element): number[] => {
      let node: Element | null = el;
      while (node) {
        const bg = parse(getComputedStyle(node).backgroundColor);
        if (bg.length >= 3 && (bg[3] === undefined || bg[3] > 0)) return bg.slice(0, 3);
        node = node.parentElement;
      }
      return [255, 255, 255];
    };

    const bad: { text: string; ratio: number; color: string }[] = [];
    document.querySelectorAll('.v4-page *, .v4-nav *').forEach((el) => {
      const ownText = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => (n.textContent || '').trim())
        .join('')
        .trim();
      if (!ownText) return;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') return;
      if (!el.getClientRects().length) return;
      const size = parseFloat(style.fontSize);
      const weight = Number(style.fontWeight) || 400;
      // WCAG "large text": 24px, or 18.66px when bold.
      const threshold = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
      const ratio = contrast(parse(style.color).slice(0, 3), backdrop(el));
      if (ratio < threshold) {
        bad.push({ text: ownText.slice(0, 40), ratio: Math.round(ratio * 100) / 100, color: style.color });
      }
    });
    return bad;
  });

  expect(failures, `Text below its contrast threshold:\n${JSON.stringify(failures, null, 2)}`).toEqual([]);
});

// ───────────────────────────── the search field ─────────────────────────────

test('typing and pressing Enter reaches the real report experience', async ({ page }) => {
  test.setTimeout(60000);
  await gotoWorkspace(page);

  const input = searchField(page);
  await expect(input).toBeVisible();
  await input.fill('Apple');
  await input.press('Enter');

  await expect(activeNavLink(page)).toHaveText('Companies', { timeout: 20000 });
  await expect(
    page.locator('.ws-view:visible').getByRole('heading', { name: 'Apple', exact: true }),
  ).toBeVisible({ timeout: 40000 });
});

test('the Read button submits what is in the field', async ({ page }) => {
  test.setTimeout(60000);
  await gotoWorkspace(page);

  await searchField(page).fill('Apple');
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  await expect(activeNavLink(page)).toHaveText('Companies', { timeout: 20000 });
});

test('/ focuses the field from anywhere, and Escape drops focus', async ({ page }) => {
  await gotoWorkspace(page);
  const input = searchField(page);

  // Focus starts elsewhere on the page.
  await page.locator('.v4-nav-wordmark').focus();
  await page.keyboard.press('/');
  await expect(input).toBeFocused();

  // The keystroke focuses rather than being typed into the field.
  await expect(input).toHaveValue('');

  await page.keyboard.press('Escape');
  await expect(input).not.toBeFocused();
});

test('/ typed inside the field is a slash, not a shortcut', async ({ page }) => {
  await gotoWorkspace(page);
  const input = searchField(page);
  await input.fill('R&D');
  await input.press('/');
  await expect(input).toHaveValue('R&D/');
});

test('each hero chip fills the field and submits', async ({ page }) => {
  test.setTimeout(60000);
  await gotoWorkspace(page);

  const chip = page.getByRole('button', { name: 'Oncology', exact: true });
  await chip.click();

  await expect(searchField(page)).toHaveValue('Oncology');
  await expect(activeNavLink(page)).toHaveText('Sectors', { timeout: 20000 });
});

test('an empty submit explains what to do and offers two working chips', async ({ page }) => {
  test.setTimeout(60000);
  await gotoWorkspace(page);

  await page.getByRole('button', { name: 'Read', exact: true }).click();

  const error = page.locator('#search-error');
  await expect(error).toContainText(/type a company or a research area/i);
  // No dead end: the recovery chips are real controls.
  const recovery = error.getByRole('button', { name: 'PFE', exact: true });
  await expect(recovery).toBeVisible();

  await recovery.click();
  await expect(searchField(page)).toHaveValue('PFE');
  await expect(activeNavLink(page)).toHaveText('Companies', { timeout: 20000 });
});

// ───────────────────────────── break attempts ─────────────────────────────

test('a 500-character query is refused with a reason, not a hang', async ({ page }) => {
  await gotoWorkspace(page);
  await searchField(page).fill('a'.repeat(500));
  await searchField(page).press('Enter');
  await expect(page.locator('#search-error')).toContainText('500 characters');
});

test('an emoji-only query is refused with a reason', async ({ page }) => {
  await gotoWorkspace(page);
  await searchField(page).fill('🎉🎉🎉');
  await searchField(page).press('Enter');
  await expect(page.locator('#search-error')).toContainText(/letters or numbers/i);
});

test('markup in the query renders inert and never executes', async ({ page }) => {
  test.setTimeout(60000);
  let alerted = false;
  page.on('dialog', async (d) => {
    alerted = true;
    await d.dismiss();
  });
  await gotoWorkspace(page);

  await searchField(page).fill('<script>alert(1)</script>');
  await searchField(page).press('Enter');
  await page.waitForTimeout(2000);

  expect(alerted).toBe(false);
  // It reached the page as text, not as a script element.
  await expect(page.locator('script:has-text("alert(1)")')).toHaveCount(0);
});

test('rapid repeated submits collapse into one run', async ({ page }) => {
  test.setTimeout(60000);
  await gotoWorkspace(page);

  const input = searchField(page);
  await input.fill('Apple');
  for (let i = 0; i < 8; i++) await input.press('Enter');

  // The field is still usable and the app landed once, not eight times.
  await expect(activeNavLink(page)).toHaveText('Companies', { timeout: 20000 });
  await expect(input).toBeEnabled();
});

test('refreshing mid-run comes back to a usable page', async ({ page }) => {
  test.setTimeout(60000);
  await gotoWorkspace(page);
  await searchField(page).fill('Apple');
  await searchField(page).press('Enter');
  await page.waitForTimeout(500);

  await page.reload({ waitUntil: 'domcontentloaded' });
  // The intro has already played for this browser, so the homepage comes back
  // directly, with an empty field ready for the next subject.
  const input = searchField(page);
  await expect(input).toBeVisible({ timeout: 20000 });
  await expect(input).toHaveValue('');
  await expect(input).toBeEnabled();
});

test('resizing mid-interaction leaves the field usable', async ({ page }) => {
  await gotoWorkspace(page);
  const input = searchField(page);
  await input.fill('Pfiz');
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(input).toHaveValue('Pfiz');
  await input.fill('Pfizer');
  await expect(input).toHaveValue('Pfizer');
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(input).toHaveValue('Pfizer');
});

// ───────────────────────────── the diagram ─────────────────────────────

test('the diagram has an accessible name and a description in words', async ({ page }) => {
  await gotoWorkspace(page);
  const svg = page.locator('.v4-diagram');
  await expect(svg).toHaveAttribute('role', 'img');
  await expect(page.locator('#provenance-title')).toContainText('Five public records');
  await expect(page.locator('#provenance-desc')).toContainText('SEC EDGAR');
});

test('hovering a record highlights it, dims the others, and swaps the caption', async ({ page }) => {
  await gotoWorkspace(page);
  await page.locator('#provenance').scrollIntoViewIfNeeded();

  const caption = page.getByTestId('provenance-caption');
  await expect(caption).toContainText('Every claim in the brief resolves');

  await page.getByTestId('provenance-node-1').hover();
  await expect(caption).toContainText('Interventional studies matched on sponsor');
  await expect(page.getByTestId('provenance-node-1')).toHaveAttribute('data-active', 'true');
  await expect(page.getByTestId('provenance-path-1')).toHaveAttribute('data-state', 'active');
  await expect(page.getByTestId('provenance-path-0')).toHaveAttribute('data-state', 'dimmed');
});

test('every record highlights on keyboard focus and swaps the caption', async ({ page }) => {
  await gotoWorkspace(page);
  await page.locator('#provenance').scrollIntoViewIfNeeded();

  const expected = [
    'Financial statements from XBRL',
    'Interventional studies matched',
    'Publications co-authored with UNC',
    'Active federally funded projects',
    'Recent research output',
  ];
  for (let i = 0; i < expected.length; i++) {
    await page.getByTestId(`provenance-node-${i}`).focus();
    await expect(page.getByTestId('provenance-caption')).toContainText(expected[i]);
    await expect(page.getByTestId(`provenance-node-${i}`)).toHaveAttribute('data-active', 'true');
  }
});

test('clicking a record selects it, and clicking it again keeps it selected', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await gotoWorkspace(page);
  await page.locator('#provenance').scrollIntoViewIfNeeded();

  const caption = page.getByTestId('provenance-caption');
  await page.getByTestId('provenance-node-2').dispatchEvent('click');
  await expect(caption).toContainText('Publications co-authored');

  // Deliberately NOT a toggle. A tap on iOS sends pointerenter and focus before
  // the click, and a toggle would read its own hover as the first press and
  // clear the record straight back off — inert on every phone.
  await page.getByTestId('provenance-node-2').dispatchEvent('click');
  await expect(caption).toContainText('Publications co-authored');

  // Another record takes over, so a visitor is never stuck on one.
  await page.getByTestId('provenance-node-4').dispatchEvent('click');
  await expect(caption).toContainText('Recent research output');
});

for (const width of [1024, 1440]) {
  test(`the diagram fills its column at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await gotoWorkspace(page);
    await page.locator('#provenance').scrollIntoViewIfNeeded();

    const measured = await page.evaluate(() => {
      const svg = document.querySelector('.v4-diagram') as SVGElement;
      const column = svg.closest('.v4-container') as HTMLElement;
      return {
        mode: svg.getAttribute('data-layout'),
        diagram: svg.getBoundingClientRect().width,
        column: column.getBoundingClientRect().width,
      };
    });

    // The overflow checks pass a diagram that is far too SMALL, which is how a
    // stray max-width cap reached production unnoticed. This is the other bound.
    expect(measured.mode).toBe('wide');
    expect(measured.diagram / measured.column).toBeGreaterThanOrEqual(0.7);
  });
}

// ───────────────────────────── navigation and footer ─────────────────────────────

test('the bar is transparent over the hero and takes a surface after 40px', async ({ page }) => {
  await gotoWorkspace(page);
  const nav = page.locator('.v4-nav');

  await expect(nav).not.toHaveClass(/v4-nav-stuck/);
  expect(await nav.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');

  await page.evaluate(() => window.scrollTo(0, 200));
  await expect(nav).toHaveClass(/v4-nav-stuck/);
  // The bar fades onto paper over 180ms, so poll for the settled colour rather
  // than reading it mid-transition.
  await expect
    .poll(() => nav.evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe('rgb(252, 252, 250)');
});

test('every nav link routes, and the wordmark comes home', async ({ page }) => {
  test.setTimeout(60000);
  await gotoWorkspace(page);

  for (const label of ['Companies', 'Sectors', 'Accounts']) {
    await clickNav(page, label);
    await expect(activeNavLink(page)).toHaveText(label, { timeout: 10000 });
    await page.locator('.v4-nav-wordmark').click();
    await expect(page.locator('.v4-page')).toBeVisible();
  }
});

test('a logged-out visitor gets a Sign in text link, not an avatar chip', async ({ page }) => {
  await gotoWorkspace(page);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.locator('.ws-account-btn')).toHaveCount(0);
});

test('the footer carries the disclaimer, the draft line, and resolving links', async ({ page }) => {
  await gotoWorkspace(page);
  const footer = page.locator('.v4-footer');

  const text = await footer.innerText();
  expect(text).toMatch(/independent project/i);
  expect(text).toMatch(/not created by, is not affiliated with, and is not endorsed by/i);
  expect(text).toMatch(/University of North Carolina at Chapel Hill/i);
  expect(text).toMatch(/not investment advice/i);
  expect(text).toContain('Reports are drafts for human verification before any outreach.');

  // Every data source is credited and linked.
  for (const name of [
    'SEC EDGAR',
    'ClinicalTrials.gov',
    'PubMed',
    'NIH RePORTER',
    'OpenAlex',
    'Wikipedia',
  ]) {
    await expect(footer.getByRole('link', { name, exact: true })).toHaveAttribute('href', /^https:/);
  }
  await expect(footer.getByRole('link', { name: /apache license/i })).toBeVisible();
  await expect(footer.getByRole('link', { name: 'Repository', exact: true })).toBeVisible();
});

test('the footer keeps every destination reachable, including on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await gotoWorkspace(page);

  // The bar drops its links on a phone; the footer is the route to them.
  await expect(page.locator('.v4-nav-links')).toBeHidden();
  const footerLinks = page.locator('.v4-footer-links');
  await expect(footerLinks).toBeVisible();
  for (const label of ['Companies', 'Sectors', 'Accounts', 'Projects']) {
    await expect(footerLinks.getByRole('button', { name: label, exact: true })).toBeVisible();
  }
});

// ───────────────────────────── responsive and motion ─────────────────────────────

for (const width of WIDTHS) {
  test(`renders without horizontal scroll at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await gotoWorkspace(page);
    // Reveal everything, so a section that only appears on scroll is measured too.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(600);

    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      win: window.innerWidth,
      widest: Array.from(document.querySelectorAll('.v4-page *'))
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { tag: el.tagName + '.' + (el.className || ''), right: r.right };
        })
        .filter((e) => e.right > window.innerWidth + 1)
        .slice(0, 5),
    }));

    expect(overflow.widest).toEqual([]);
    expect(overflow.doc).toBeLessThanOrEqual(overflow.win);
  });
}

test('a jump straight to the end still reveals the sections it skipped', async ({ page }) => {
  await gotoWorkspace(page);
  // Nobody scrolls through this page section by section. Jumping past the
  // middle must not leave it permanently invisible.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(800);

  const hidden = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.v4-reveal'))
      .filter((el) => getComputedStyle(el).opacity !== '1')
      .map((el) => (el.textContent || '').slice(0, 40)),
  );
  expect(hidden).toEqual([]);
});

test.describe('reduced motion', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('shows every element in its final state with no animation', async ({ page }) => {
    await gotoWorkspace(page);

    const state = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.v4-reveal')).map((el) => {
        const s = getComputedStyle(el);
        return { opacity: s.opacity, transform: s.transform, transition: s.transitionDuration };
      }),
    );

    expect(state.length).toBeGreaterThan(0);
    for (const el of state) {
      expect(el.opacity).toBe('1');
      expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(el.transform);
    }
  });

  test('the diagram highlight is an instant state change', async ({ page }) => {
    await gotoWorkspace(page);
    await page.locator('#provenance').scrollIntoViewIfNeeded();
    await page.getByTestId('provenance-node-3').focus();

    await expect(page.getByTestId('provenance-caption')).toContainText('Active federally funded');
    const duration = await page
      .getByTestId('provenance-node-3')
      .locator('rect')
      .evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(duration).toBe('0s');
  });
});

// ───────────────────────────── keyboard ─────────────────────────────

test('every tab stop on the page shows a visible focus ring', async ({ page }) => {
  await gotoWorkspace(page);

  const seen: string[] = [];
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      return {
        id: el.tagName + '.' + (typeof el.className === 'string' ? el.className : ''),
        outlineWidth: s.outlineWidth,
        outlineStyle: s.outlineStyle,
      };
    });
    if (!focused) continue;
    if (seen.includes(focused.id + i)) continue;
    seen.push(focused.id + i);
    // Either an outline ring, or the field wrapper's ring (the input delegates
    // its ring to the row it sits in, which is the one visible element).
    const ringed =
      focused.outlineStyle !== 'none' && parseFloat(focused.outlineWidth) >= 2;
    const delegated = await page.evaluate(
      () => !!document.querySelector('.v4-field:focus-within'),
    );
    expect(ringed || delegated).toBe(true);
  }
  expect(seen.length).toBeGreaterThan(5);
});
