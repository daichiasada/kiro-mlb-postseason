import type { Page, Route } from '@playwright/test';

/**
 * A realistic Prediction JSON matching `@mlb/shared`'s Prediction type, used to
 * stub the `/prediction` endpoint (which has no offline fallback) so the
 * success path can be asserted deterministically.
 */
export const SAMPLE_PREDICTION = {
  seriesId: '2024-ws-worldseries-119-147',
  // Los Angeles Dodgers (119) are the favorite over the Yankees (147).
  favoriteTeamId: 119,
  favoriteWinProbability: 0.68,
  narrative:
    'The Dodgers enter the World Series with a deep rotation and a relentless ' +
    'lineup. Expect Los Angeles to control the series tempo and close it out ' +
    'behind clutch late-inning hitting.',
  model: 'anthropic.claude-3-haiku',
  generatedAt: '2024-10-25T00:00:00.000Z',
};

/** Routes `**\/prediction*` to a successful Prediction response. */
export async function stubPredictionSuccess(page: Page): Promise<void> {
  await page.route('**/prediction*', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SAMPLE_PREDICTION),
    });
  });
}

/** Routes `**\/prediction*` to an error so the error/alert UI can be asserted. */
export async function stubPredictionError(
  page: Page,
  status = 500,
): Promise<void> {
  await page.route('**/prediction*', async (route: Route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Prediction service unavailable' }),
    });
  });
}
