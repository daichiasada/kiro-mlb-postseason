import { test, expect } from '@playwright/test';

/**
 * Model accuracy / backtest page (Issue #16).
 *
 * The page is fully client-side: it replays the bundled 2024/2025 seed data
 * through the pure `@mlb/shared` backtest engine. No backend runs during E2E
 * and no Bedrock call is involved, so the numbers are deterministic. The
 * default UI language is Japanese; we assert the JA copy and then flip to EN
 * via the header language toggle.
 */
test.describe('model accuracy / backtest', () => {
  test('navigates from the bracket nav link to the accuracy page', async ({
    page,
  }) => {
    await page.goto('/');

    // The localized nav link (default language is Japanese).
    await page.getByRole('link', { name: 'モデル精度' }).click();
    await expect(page).toHaveURL(/\/accuracy$/);

    await expect(
      page.getByRole('region', { name: /モデル精度とバックテスト結果/ }),
    ).toBeVisible();
  });

  test('shows the three metrics and explanations in JA, then EN via the toggle', async ({
    page,
  }) => {
    await page.goto('/accuracy');

    const region = page.getByRole('region', {
      name: /モデル精度とバックテスト結果/,
    });
    await expect(region).toBeVisible();

    // Three metrics (JA).
    await expect(region.getByText('的中率').first()).toBeVisible();
    await expect(region.getByText('ブライアスコア').first()).toBeVisible();
    await expect(region.getByText('キャリブレーション').first()).toBeVisible();

    // Metric explanations (JA): the Brier + calibration definitions.
    await expect(
      region.getByText(/最終的なシリーズ勝者に対して予測した確率と1との平均二乗誤差/),
    ).toBeVisible();
    await expect(
      region.getByText(/予測を確率のバケットにグループ分けし/),
    ).toBeVisible();

    // The multi-accuracy comparison is present (JA): several accuracy settings.
    const comparison = page.getByTestId('accuracy-comparison');
    await expect(comparison).toBeVisible();
    for (const accuracy of ['0.00', '0.25', '0.50', '0.75', '1.00']) {
      await expect(
        comparison.getByRole('rowheader', { name: accuracy }),
      ).toBeVisible();
    }

    // Flip to English via the header language toggle.
    await page.getByRole('button', { name: 'English' }).click();

    const enRegion = page.getByRole('region', {
      name: /model accuracy and backtest results/i,
    });
    await expect(enRegion).toBeVisible();
    await expect(enRegion.getByText('Hit rate').first()).toBeVisible();
    await expect(enRegion.getByText('Brier score').first()).toBeVisible();
    await expect(enRegion.getByText('Calibration').first()).toBeVisible();
    await expect(
      enRegion.getByText(
        /mean squared error between the predicted probability of the eventual series winner and 1/i,
      ),
    ).toBeVisible();
    await expect(
      enRegion.getByText(
        /groups predictions into probability buckets and compares the mean predicted probability/i,
      ),
    ).toBeVisible();

    await page.screenshot({
      path: 'test-results/accuracy-page.png',
      fullPage: true,
    });
  });
});
