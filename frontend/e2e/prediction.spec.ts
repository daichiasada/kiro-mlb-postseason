import { test, expect } from '@playwright/test';
import {
  SAMPLE_2026_FINAL_SERIES_ID,
  SAMPLE_2026_SERIES_ID,
  SAMPLE_PREDICTION,
  stubBracket2026,
  stubBracket2026WithIntegrityWarnings,
  stubPredictionCapturingAccuracy,
  stubPredictionCapturingLangModel,
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

    // Select the series via its Predict affordance (available for 2026). The
    // label is localized, so match the predict button structurally.
    await wsCard.locator('.series-card__predict').click();

    const panel = page.getByRole('region', { name: /勝敗予測/ });
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
    await wsCard.locator('.series-card__predict').click();

    const panel = page.getByRole('region', { name: /勝敗予測/ });
    const alert = panel.getByRole('alert');
    await expect(alert).toBeVisible();
    // The localized error prefix ("予測を読み込めませんでした") wraps the message.
    await expect(alert).toContainText(/予測を読み込めませんでした/);

    await page.screenshot({
      path: 'test-results/prediction-error.png',
      fullPage: true,
    });
  });

  test('accuracy control: default request + a new request carrying the chosen accuracy updates the UI', async ({
    page,
  }) => {
    await stubBracket2026(page);
    const captured = await stubPredictionCapturingAccuracy(page);
    await page.goto('/');

    const wsCard = page.locator(`[data-series-id="${SAMPLE_2026_SERIES_ID}"]`);
    await wsCard.locator('.series-card__predict').click();

    const panel = page.getByRole('region', { name: /勝敗予測/ });
    await expect(panel).toBeVisible();

    // The initial request carries the default accuracy (0.5) and renders a
    // probability of 0.5 + 0.4*0.5 = 0.70 -> 70.0%.
    await expect(panel.getByText(/70\.0%/)).toBeVisible();
    await expect.poll(() => captured[0]).toBe('0.5');

    // The accessible, localized accuracy slider is present.
    const slider = panel.locator('.prediction__accuracy-slider');
    await expect(slider).toBeVisible();
    await expect(slider).toHaveValue('0.5');

    // Drag to maximum accuracy; a NEW /prediction request fires carrying the
    // accuracy param and the displayed probability updates (0.5 + 0.4*1 = 0.90
    // -> 90.0%).
    await slider.fill('1');
    await expect.poll(() => captured.at(-1)).toBe('1');
    await expect(panel.getByText(/90\.0%/)).toBeVisible();

    await page.screenshot({
      path: 'test-results/prediction-accuracy.png',
      fullPage: true,
    });
  });

  test('final series: no predict button, surfaces the detail link instead, and no numeric prediction', async ({
    page,
  }) => {
    await stubBracket2026(page);
    // If any /prediction request were made for the final series it would be
    // captured; we assert it is NOT.
    const captured = await stubPredictionCapturingAccuracy(page);
    await page.goto('/');

    const finalCard = page.locator(
      `[data-series-id="${SAMPLE_2026_FINAL_SERIES_ID}"]`,
    );
    await expect(finalCard).toBeVisible();

    // The finished series exposes NO interactive predict button, even in the
    // predictable 2026 season.
    await expect(finalCard.locator('.series-card__predict')).toHaveCount(0);
    // It surfaces the detail-page link instead.
    const detailLink = finalCard.locator('.series-card__detail-link');
    await expect(detailLink).toBeVisible();

    // Clicking the link navigates to the detail page (no numeric prediction).
    await detailLink.click();
    await expect(page).toHaveURL(
      new RegExp(`/season/2026/series/${SAMPLE_2026_FINAL_SERIES_ID}$`),
    );
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    // No prediction request was ever issued for the final series.
    expect(captured).toHaveLength(0);
  });

  test('localization + model: default request carries lang=ja; selecting an Amazon model and toggling language re-requests', async ({
    page,
  }) => {
    await stubBracket2026(page);
    const captured = await stubPredictionCapturingLangModel(page);
    await page.goto('/');

    const wsCard = page.locator(`[data-series-id="${SAMPLE_2026_SERIES_ID}"]`);
    await wsCard.locator('.series-card__predict').click();

    const panel = page.getByRole('region', { name: /勝敗予測/ });
    await expect(panel).toBeVisible();

    // The default request carries the default UI language (ja) and the default
    // Amazon model (Nova Lite).
    await expect.poll(() => captured[0]?.lang).toBe('ja');
    await expect.poll(() => captured[0]?.model).toBe('us.amazon.nova-lite-v1:0');

    // Select a different Amazon model (Nova Pro) from the localized selector.
    const modelSelect = panel.locator('.prediction__model-select');
    await expect(modelSelect).toBeVisible();
    await modelSelect.selectOption('us.amazon.nova-pro-v1:0');
    await expect
      .poll(() => captured.at(-1)?.model)
      .toBe('us.amazon.nova-pro-v1:0');

    // Toggle the language to English; a new request fires carrying lang=en and
    // the chosen model.
    await page.getByRole('button', { name: 'English' }).click();
    await expect.poll(() => captured.at(-1)?.lang).toBe('en');
    await expect
      .poll(() => captured.at(-1)?.model)
      .toBe('us.amazon.nova-pro-v1:0');
  });

  test('integrity banner: visible when the bracket carries integrityWarnings; absent for a clean bracket', async ({
    page,
  }) => {
    // Clean bracket -> no banner.
    await stubBracket2026(page);
    await stubPredictionSuccess(page);
    await page.goto('/');
    await expect(
      page.getByRole('region', { name: /ポストシーズンのトーナメント表/ }),
    ).toBeVisible();
    await expect(page.getByText(/データ整合性/)).toHaveCount(0);

    // Flagged bracket -> localized, non-blocking banner appears and the bracket
    // still renders.
    await page.unroute('**/bracket*');
    await stubBracket2026WithIntegrityWarnings(page);
    await page.reload();

    const banner = page.locator('.app__notice--integrity');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/データ整合性/);
    await expect(
      page.getByRole('region', { name: /ポストシーズンのトーナメント表/ }),
    ).toBeVisible();

    await page.screenshot({
      path: 'test-results/prediction-integrity-banner.png',
      fullPage: true,
    });
  });
});
