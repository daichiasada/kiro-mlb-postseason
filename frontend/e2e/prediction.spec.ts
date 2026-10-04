import { test, expect } from '@playwright/test';
import {
  SAMPLE_PREDICTION,
  stubPredictionError,
  stubPredictionSuccess,
} from './fixtures';

/**
 * Prediction flow coverage. The `/prediction` endpoint has no offline fallback,
 * so it is stubbed per-test with `page.route` to exercise both the success and
 * error UI states deterministically.
 */
test.describe('prediction panel', () => {
  test('success: favorite, labeled probability bar, and narrative render', async ({
    page,
  }) => {
    await stubPredictionSuccess(page);
    await page.goto('/');

    // Select the World Series via its Predict affordance.
    const wsCard = page.locator(
      '[data-series-id="2024-ws-worldseries-119-147"]',
    );
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
    await stubPredictionError(page, 500);
    await page.goto('/');

    const wsCard = page.locator(
      '[data-series-id="2024-ws-worldseries-119-147"]',
    );
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
