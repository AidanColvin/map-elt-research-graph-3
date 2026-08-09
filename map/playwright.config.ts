import { defineConfig, devices } from '@playwright/test';

// Point the suite at an already-running server with PLAYWRIGHT_BASE_URL — e.g.
// a production build on :3010, which is what the app actually ships. When it is
// unset the behaviour is unchanged: boot a dev server on :3000 for the run.
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120000,
  use: {
    baseURL: externalBaseURL || 'http://localhost:3000',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  // Chromium is the default engine for the suite. WebKit is the engine every
  // iPhone and iPad actually runs — Safari there is WebKit no matter which
  // browser is installed — so anything touch- or Safari-specific has to be
  // checked against it rather than against a Chromium phone emulation.
  // Target one with `--project=webkit`; with no flag both run.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  // Boot the app automatically for the run. Locally this reuses a server you
  // already have on :3000; in CI it starts a fresh dev server. Skipped entirely
  // when PLAYWRIGHT_BASE_URL names a server that is already up.
  ...(externalBaseURL
    ? {}
    : {
        webServer: {
          command: 'npm run dev',
          url: 'http://localhost:3000',
          timeout: 120000,
          reuseExistingServer: !process.env.CI,
        },
      }),
});
