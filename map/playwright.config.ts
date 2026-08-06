import { defineConfig } from '@playwright/test';

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
