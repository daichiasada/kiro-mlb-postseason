import { test, expect } from '@playwright/test';
import {
  SAMPLE_2026_SERIES_ID,
  SAMPLE_PREDICTION,
  stubBracket2026,
  stubPredictionError,
  stubPredictionSuccess,
} from './fixtures';

/**
 * Prediction flow coverage for the current, predictable season (2026).
 *
 * The default season is 2026, which has no offline seed, so both `/bracket` and
 * `/prediction` are stubbed per-test with `page.route` to make the predictable
 * UI and prediction states deterministic without a backend.
 */
test.describe('prediction panel (2026 predictable season)', () => {
  test('success: favorite, labeled probability bar, and narrative render', async ({
    page,
  }) => {
    await stubBracket2026(page);
    await stubPredictionSuccess(page);
    await page.goto('/');

    // The 2026 World Series card renders from the stubbed in-progress bracket.
    const wsCard = page.locator(`[data-series-id="${SAMPLE_2026_SERIES_ID}"]`);
    await expect(wsCard).toBeVisible();

    // Select the series via its Predict affordance (available for 2026).
    await wsCard.getByRole('button', { name: /predict/i }).click();

    const panel = page.getByRole('region', { name: /win\/loss prediction/i });
    await expect(panel).toBeVisible();

    // Favorite team name.
    await expect(panel.getByText('Los Angeles Dodgers')).toBeVisible();

    // Accessible, labeled probability bar.
    const bar = panel.getByRole('progressbar');
    await expect(bar).toBeVisible();
    const expectedPercent = Math.round(
      SAMPLE_PREDICTION.favoriteWinProbability * 1000,
    ) / 10; // 68
    await expect(bar).toHaveAttribute(
      'aria-valuenow',
      String(expectedPercent),
    );
    await expect(bar).toHaveAttribute('aria-valuemin', '0');
    await expect(bar).toHaveAttribute('aria-valuemax', '100');

    // Visible percentage text.
    await expect(panel.getByText(/68\.0%/)).toBeVisible();

    // AI narrative text.
    await expect(
      panel.getByText(SAMPLE_PREDICTION.narrative.slice(0, 24), {
        exact: false,
      }),
    ).toBeVisible();

    await page.screenshot({
      path: 'test-results/prediction-success.png',
      fullPage: true,
    });
  });

  test('error: shows an alert when the prediction request fails', async ({
    page,
  }) => {
    await stubBracket2026(page);
    await stubPredictionError(page, 500);
    await page.goto('/');

    const wsCard = page.locator(`[data-series-id="${SAMPLE_2026_SERIES_ID}"]`);
    await wsCard.getByRole('button', { name: /predict/i }).click();

    const panel = page.getByRole('region', { name: /win\/loss prediction/i });
    const alert = panel.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/could not load prediction/i);

    await page.screenshot({
      path: 'test-results/prediction-error.png',
      fullPage: true,
    });
  });
});
