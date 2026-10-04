import type { Page, Route } from '@playwright/test';

/**
 * A 2026 in-progress World Series used to stub the `/bracket?season=2026`
 * endpoint. The default season is the current year (2026) which has no offline
 * seed, so the predictable-season e2e flow stubs a real-looking bracket to make
 * the prediction UI deterministic. The series id matches the stubbed prediction
 * below so clicking "Predict winner" resolves against it.
 */
export const SAMPLE_2026_SERIES_ID = '2026-ws-worldseries-119-147';

export const SAMPLE_2026_BRACKET = {
  season: 2026,
  updatedAt: '2026-10-25T00:00:00.000Z',
  series: [
    {
      id: SAMPLE_2026_SERIES_ID,
      round: 'World Series',
      league: 'WS',
      // Los Angeles Dodgers (119) lead the New York Yankees (147) in progress.
      high: { teamId: 119, wins: 2 },
      low: { teamId: 147, wins: 1 },
      bestOf: 7,
      status: 'in_progress',
      games: [],
    },
  ],
};

/**
 * A realistic Prediction JSON matching the `mode: 'prediction'` variant of
 * `@mlb/shared`'s PredictionResponse, used to stub the `/prediction` endpoint
 * (which has no offline fallback) so the success path can be asserted
 * deterministically for the 2026 predictable season.
 */
export const SAMPLE_PREDICTION = {
  mode: 'prediction' as const,
  seriesId: SAMPLE_2026_SERIES_ID,
  // Los Angeles Dodgers (119) are the favorite over the Yankees (147).
  favoriteTeamId: 119,
  favoriteWinProbability: 0.68,
  narrative:
    'The Dodgers enter the World Series with a deep rotation and a relentless ' +
    'lineup. Expect Los Angeles to control the series tempo and close it out ' +
    'behind clutch late-inning hitting.',
  model: 'anthropic.claude-3-haiku',
  generatedAt: '2026-10-25T00:00:00.000Z',
};

/** Routes `**\/bracket*` for 2026 to a real-looking in-progress bracket. */
export async function stubBracket2026(page: Page): Promise<void> {
  await page.route('**/bracket*', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SAMPLE_2026_BRACKET),
    });
  });
}

/** Routes `**\/prediction*` to a successful prediction response. */
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
