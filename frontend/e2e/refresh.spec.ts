import { test, expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { SAMPLE_2026_BRACKET, SAMPLE_2026_SERIES_ID } from './fixtures';

/**
 * Auto-refresh / "last updated" / manual-refresh coverage for Issue #17.
 *
 * No backend runs during E2E, so `/bracket` is stubbed per-test with
 * `page.route`. The default UI language is Japanese, so the "last updated"
 * line and the manual refresh button are matched by their localized strings
 * ("最終更新" and the "更新" button).
 *
 * Production polls every 60s (AUTO_REFRESH_INTERVAL_MS), far longer than any
 * test could wait. To make the auto-poll assertions MEANINGFUL, the e2e bundle
 * is built with a short test-only interval injected via
 * `VITE_AUTO_REFRESH_INTERVAL_MS` (see `playwright.config.ts`'s
 * `E2E_POLL_INTERVAL_MS`). With that short interval:
 *   - the in-progress 2026 test can wait past one period and observe an
 *     UNPROMPTED, interval-driven second `/bracket` fetch (polling is ON), and
 *   - the results-only 2024 test can wait past several periods and prove NO
 *     extra fetch fires (the polling gate is OFF) - an assertion that would now
 *     genuinely fail if polling were wrongly enabled.
 *
 * The short interval is a build-time test override only; it never changes the
 * 60s production default.
 */

/**
 * Must comfortably exceed `E2E_POLL_INTERVAL_MS` in `playwright.config.ts` so a
 * tick WOULD fire within the window if polling were armed. Kept small to stay
 * fast while leaving ample margin over the short test interval.
 */
const POLL_WAIT_MS = 3000;

/**
 * Routes `**\/bracket*` to the in-progress 2026 bracket and returns a getter
 * for how many times the endpoint was requested, so a test can assert that a
 * manual refresh issues an additional fetch.
 */
async function stubBracket2026Counting(
  page: Page,
): Promise<() => number> {
  let count = 0;
  await page.route('**/bracket*', async (route: Route) => {
    count += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SAMPLE_2026_BRACKET),
    });
  });
  return () => count;
}

/**
 * A results-only 2024 bracket: every series is `final` (no `in_progress`), so
 * the polling predicate (predictable season AND an in-progress series) is
 * false and the page must NOT auto-poll. Routes `**\/bracket*` to it and
 * returns a getter for the request count so a test can assert no extra,
 * unprompted fetch occurs.
 */
async function stubResultsOnlyCounting(page: Page): Promise<() => number> {
  const resultsOnlyBracket = {
    season: 2024,
    updatedAt: '2024-11-01T00:00:00.000Z',
    series: [
      {
        id: '2024-ws-worldseries-119-147',
        round: 'World Series',
        league: 'WS',
        high: { teamId: 119, wins: 4 },
        low: { teamId: 147, wins: 1 },
        bestOf: 7,
        status: 'final',
        games: [],
      },
    ],
  };
  let count = 0;
  await page.route('**/bracket*', async (route: Route) => {
    count += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(resultsOnlyBracket),
    });
  });
  return () => count;
}

test.describe('auto-refresh (Issue #17)', () => {
  test('in-progress 2026: shows last-updated + manual refresh, and a manual refresh re-fetches without a full loading screen', async ({
    page,
  }) => {
    const bracketRequests = await stubBracket2026Counting(page);
    await page.goto('/');

    // The in-progress World Series card renders, confirming the bracket loaded.
    const wsCard = page.locator(`[data-series-id="${SAMPLE_2026_SERIES_ID}"]`);
    await expect(wsCard).toBeVisible();

    // The localized "last updated" line is visible (default UI language: ja).
    await expect(page.getByText(/最終更新/)).toBeVisible();

    // The manual refresh control is present (localized "更新" button).
    const refreshButton = page.getByRole('button', { name: /更新/ });
    await expect(refreshButton).toBeVisible();

    // The initial load issued exactly one /bracket request.
    await expect.poll(bracketRequests).toBe(1);

    const bracket = page.getByRole('region', {
      name: /ポストシーズンのトーナメント表/,
    });
    await expect(bracket).toBeVisible();

    // Auto-polling is ON for an in-progress season: with the short test
    // interval, an UNPROMPTED, interval-driven second /bracket fetch must fire
    // within the window WITHOUT any user interaction. This proves the polling
    // path end-to-end (not just the manual button). The default 60s production
    // interval would make this impossible, hence the test-only override.
    await expect.poll(bracketRequests, { timeout: POLL_WAIT_MS }).toBeGreaterThanOrEqual(2);
    const afterAutoPoll = bracketRequests();

    // Drive the manual refresh too and confirm it issues yet another fetch.
    await refreshButton.click();

    // A further /bracket request is made on top of the auto-polled ones.
    await expect
      .poll(bracketRequests)
      .toBeGreaterThan(afterAutoPoll);

    // The refresh is flicker-free: the full-screen loading status never shows
    // and the bracket region stays mounted/visible throughout.
    await expect(
      page.getByText(/ポストシーズンを読み込み中/),
    ).toHaveCount(0);
    await expect(bracket).toBeVisible();
    await expect(wsCard).toBeVisible();

    await page.screenshot({
      path: 'test-results/refresh-in-progress.png',
      fullPage: true,
    });
  });

  test('results-only season (2024): does not auto-poll (no unprompted second /bracket fetch)', async ({
    page,
  }) => {
    const bracketRequests = await stubResultsOnlyCounting(page);
    await page.goto('/');

    // Drive the season selector to a results-only season (2024).
    await page
      .getByTestId('season-group')
      .getByRole('button', { name: '2024' })
      .click();

    // The 2024 results-only bracket renders.
    const wsCard = page.locator(
      '[data-series-id="2024-ws-worldseries-119-147"]',
    );
    await expect(wsCard).toBeVisible();

    // Switching to 2024 triggered its own single initial fetch. Issue #17
    // criterion 1: a results-only season (not predictable, no in-progress
    // series) must NOT start the polling interval. The initial 2026 default
    // load plus the 2024 load account for every expected request; no
    // additional unprompted fetch may occur.
    const afterLoad = bracketRequests();

    // Wait well PAST several short test-interval periods and confirm no extra,
    // unprompted /bracket request fired - i.e. the page is not auto-polling.
    // Because the e2e bundle uses the short E2E_POLL_INTERVAL_MS, a tick WOULD
    // have fired in this window if the gate were (wrongly) armed, so this
    // assertion is now a genuine proof of criterion 1 rather than vacuous.
    await page.waitForTimeout(POLL_WAIT_MS);
    expect(bracketRequests()).toBe(afterLoad);

    await page.screenshot({
      path: 'test-results/refresh-results-only.png',
      fullPage: true,
    });
  });
});
