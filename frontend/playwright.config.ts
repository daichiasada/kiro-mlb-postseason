import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright end-to-end configuration for the MLB Postseason Pulse SPA.
 *
 * The suite runs fully offline: the frontend falls back to the bundled
 * `@mlb/shared` 2024 seed bracket when no backend is reachable, and the
 * prediction endpoint is stubbed per-test with `page.route`.
 *
 * `webServer` builds the SPA (if needed) and serves the production bundle with
 * `vite preview` on a fixed port so Playwright can start and stop it itself.
 */
const PORT = 4318;

/**
 * Test-only auto-refresh poll interval, in milliseconds.
 *
 * Production always polls every 60s (AUTO_REFRESH_INTERVAL_MS). For the e2e
 * run we bake a much shorter interval into the bundle via
 * `VITE_AUTO_REFRESH_INTERVAL_MS` (read in `src/config.ts`) so the suite can
 * actually observe an interval-driven tick within its wait window - and so the
 * "results-only season does not auto-poll" assertion can genuinely fail if the
 * polling gate were ever wrong, instead of being vacuous against a 60s period.
 * This env var is set here only; normal dev/prod builds leave it unset and keep
 * the 60s default.
 */
const E2E_POLL_INTERVAL_MS = 500;

export default defineConfig({
  testDir: './e2e',
  // Artifacts (screenshots, traces) land here; gitignored.
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // Capture a screenshot and trace when a test fails for visual inspection.
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Headless with --no-sandbox: the sandbox has no display server and
        // nested sandboxing fails without this flag.
        headless: true,
        launchOptions: {
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        },
      },
    },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    // Bake the short test-only poll interval into the bundle. Vite reads
    // VITE_* vars from the environment at build time, so this value flows into
    // `src/config.ts`'s POLL_INTERVAL_MS for the e2e bundle only.
    env: {
      VITE_AUTO_REFRESH_INTERVAL_MS: String(E2E_POLL_INTERVAL_MS),
    },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
