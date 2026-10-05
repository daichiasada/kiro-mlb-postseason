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
 * The auto-refresh interval is 60s (AUTO_REFRESH_INTERVAL_MS); these tests must
 * stay deterministic, so they drive the MANUAL refresh button rather than
 * waiting for the interval to fire.
 */

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

    // Drive the manual refresh (do NOT wait for the 60s interval).
    await refreshButton.click();

    // A second /bracket request is made.
    await expect.poll(bracketRequests).toBeGreaterThanOrEqual(2);

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

    // Wait a few seconds (well short of the 60s interval) and confirm no extra,
    // unprompted /bracket request fired - i.e. the page is not auto-polling.
    await page.waitForTimeout(3000);
    expect(bracketRequests()).toBe(afterLoad);

    await page.screenshot({
      path: 'test-results/refresh-results-only.png',
      fullPage: true,
    });
  });
});
