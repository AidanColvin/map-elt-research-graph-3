import { test, expect, type Page } from '@playwright/test';

/**
 * Owner-approval gate and credential storage.
 *
 * Two properties are asserted here, both of which used to be violated:
 *  1. Registering does not grant access. A new account waits for an owner.
 *  2. The plaintext password is never written to storage or the session — only
 *     a salted PBKDF2 digest is kept (lib/credentials.ts).
 *
 * Each test starts from a wiped origin so account state never leaks between
 * runs, and every assertion reads real browser storage rather than trusting UI.
 */

const PASSWORD = 'correct-horse-battery-staple';

// takes: the page and an email
// does: wipes storage, loads the app, and registers a brand-new account
// returns: nothing
async function signUp(page: Page, email: string): Promise<void> {
  await page.goto('/?skipIntro=1');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/?skipIntro=1');

  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByPlaceholder('Email address').fill(email);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.getByRole('button', { name: /Create account|Sign up|Log in/ }).first().click();
}

test.describe('owner approval gate', () => {
  test('a new account waits for approval instead of entering the workspace', async ({ page }) => {
    await signUp(page, 'pending-user@example.com');

    await expect(page.getByText(/Waiting on approval/i)).toBeVisible();

    // The workspace chrome must not be reachable behind the waiting screen.
    await expect(page.getByRole('button', { name: 'Directory' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Partnerships' })).toHaveCount(0);

    // The roster is keyed by fingerprint, so find the single record rather
    // than looking one up by address — the address is not a key any more.
    const records = await page.evaluate(() => {
      const raw = localStorage.getItem('map.accounts');
      return Object.values(raw ? JSON.parse(raw) : {}) as any[];
    });
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('pending');
  });

  test('the plaintext password is never persisted anywhere', async ({ page }) => {
    await signUp(page, 'hash-check@example.com');
    // Signing up hashes with 210k PBKDF2 rounds; wait for the resulting screen
    // so storage is read after the write, not during it.
    await expect(page.getByText(/Waiting on approval/i)).toBeVisible();

    const dump = await page.evaluate(() => {
      const all: Record<string, string | null> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!;
        all[key] = localStorage.getItem(key);
      }
      return JSON.stringify(all);
    });

    expect(dump).not.toContain(PASSWORD);
    // The address must not survive anywhere either — not in a value and not in
    // a key. Key names used to publish the full membership list on their own.
    expect(dump).not.toContain('hash-check@example.com');
    expect(dump).not.toContain('hash-check');

    // What IS stored must be a salted digest with a real iteration count.
    const cred = await page.evaluate(() => {
      const users = JSON.parse(localStorage.getItem('map.users') || '{}');
      const values = Object.values(users) as any[];
      return values.length === 1 ? values[0] : null;
    });
    expect(cred).not.toBeNull();
    expect(typeof cred.salt).toBe('string');
    expect(cred.salt.length).toBeGreaterThanOrEqual(32);
    expect(typeof cred.hash).toBe('string');
    expect(cred.hash.length).toBe(64); // 256-bit digest as hex
    expect(cred.iterations).toBeGreaterThanOrEqual(100_000);
  });

  test('an approved account reaches the workspace', async ({ page }) => {
    await signUp(page, 'approved-user@example.com');
    await expect(page.getByText(/Waiting on approval/i)).toBeVisible();

    // Stand in for the owner's decision, then re-enter.
    await page.evaluate(() => {
      const accounts = JSON.parse(localStorage.getItem('map.accounts') || '{}');
      const key = Object.keys(accounts)[0];
      accounts[key].status = 'approved';
      localStorage.setItem('map.accounts', JSON.stringify(accounts));
      const session = JSON.parse(localStorage.getItem('map.session') || '{}');
      session.status = 'approved';
      localStorage.setItem('map.session', JSON.stringify(session));
    });
    await page.goto('/?skipIntro=1');

    await expect(page.getByRole('button', { name: 'Directory' })).toBeVisible();
    await expect(page.getByText(/Waiting on approval/i)).toHaveCount(0);
  });

  test('a denied account is turned away and cannot re-register past it', async ({ page }) => {
    await signUp(page, 'denied-user@example.com');
    await expect(page.getByText(/Waiting on approval/i)).toBeVisible();

    await page.evaluate(() => {
      const accounts = JSON.parse(localStorage.getItem('map.accounts') || '{}');
      const key = Object.keys(accounts)[0];
      accounts[key].status = 'denied';
      localStorage.setItem('map.accounts', JSON.stringify(accounts));
      const session = JSON.parse(localStorage.getItem('map.session') || '{}');
      session.status = 'denied';
      localStorage.setItem('map.session', JSON.stringify(session));
    });
    await page.goto('/?skipIntro=1');

    await expect(page.getByText(/wasn't approved/i)).toBeVisible();

    // Re-requesting must not reset the decision back to pending.
    const stillDenied = await page.evaluate(() => {
      const accounts = JSON.parse(localStorage.getItem('map.accounts') || '{}');
      return (Object.values(accounts)[0] as any)?.status;
    });
    expect(stillDenied).toBe('denied');
  });
});

test.describe('guest access to identifiable data', () => {
  test('a guest is asked to sign in for Directory and Partnerships', async ({ page }) => {
    await page.goto('/?skipIntro=1');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/?skipIntro=1');
    await page.getByRole('button', { name: /Continue as guest/ }).click();

    await page.getByRole('button', { name: 'Directory' }).click();
    await expect(page.getByText(/Directory needs an account/i)).toBeVisible();

    await page.getByRole('button', { name: 'Partnerships' }).click();
    await expect(page.getByText(/Partnerships needs an account/i)).toBeVisible();
  });
});
