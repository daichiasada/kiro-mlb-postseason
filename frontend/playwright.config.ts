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
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
