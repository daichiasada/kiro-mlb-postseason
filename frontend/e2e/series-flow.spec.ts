import { test, expect } from '@playwright/test';
import {
  SAMPLE_2026_FINAL_SERIES_ID,
  stubBracket2026,
} from './fixtures';
import { THEME_STORAGE_KEY } from '../src/theme';

/**
 * Series-flow visualization e2e coverage (Issue #24, FEAT-003).
 *
 * Proves end to end that:
 *  1. A 2024 (bundled seed, offline fallback) finished-series detail renders
 *     the score-diff bar chart + the cumulative trend chart + their tabular
 *     alternatives, and does NOT render the prediction overlay (results-only
 *     season is not predictable).
 *  2. A predictable 2026 series that HAS games (the stubbed FINAL ALCS) renders
 *     the probability-trend chart and its probability column.
 *  3. A bracket card on the home page shows the score-diff sparkline (role=img).
 *  4. A dark-mode screenshot of a detail page with charts is captured for
 *     legibility review (test-results is gitignored).
 *
 * Default language is Japanese, so chart/section names are matched by their
 * localized text (role=img accessible names come from the <figcaption>).
 */

// Localized accessible names of the three charts (default lang = ja).
const DIFF_CHART = '試合ごとの得点差';
const TREND_CHART = 'シリーズ累計勝利数';
const PROB_CHART = '試合ごとの予測勝利確率';

test.describe('series-flow charts on the detail page', () => {
  test('a 2024 seed series renders the diff + trend charts and tables, with NO probability chart', async ({
    page,
  }) => {
    // 2024 is a results-only season served fully offline from the bundled
    // @mlb/shared seed, so no /bracket stub is needed. Deep-link to a finished
    // AL Wild Card series that has games.
    await page.goto('/season/2024/series/2024-al-wildcard-117-116');

    const flow = page.getByRole('region', { name: 'シリーズの流れ' });
    await expect(flow).toBeVisible();

    // Both base charts render as accessible SVGs (role=img).
    await expect(flow.getByRole('img', { name: DIFF_CHART })).toBeVisible();
    await expect(flow.getByRole('img', { name: TREND_CHART })).toBeVisible();

    // The prediction overlay is absent for a results-only season.
    await expect(flow.getByRole('img', { name: PROB_CHART })).toHaveCount(0);

    // The tabular alternative is collapsed behind a toggle; open the first
    // (score-diff) table and assert a real <table> with the data is revealed.
    const diffFigure = flow.locator('.series-flow__figure').first();
    const diffToggle = diffFigure.locator('.series-flow__table-toggle');
    await expect(diffToggle).toHaveText(/データ表を表示/);
    await diffToggle.click();
    const diffTable = diffFigure.locator('table');
    await expect(diffTable).toBeVisible();
    // The winner column conveys the result as TEXT, not color alone.
    await expect(diffTable).toContainText(/勝利/);
  });

  test('a predictable 2026 series with games renders the probability-trend chart + column', async ({
    page,
  }) => {
    await stubBracket2026(page);
    // The stubbed FINAL ALCS (117 vs 136) has 2 games; 2026 is the predictable
    // current season, so the probability overlay must appear.
    await page.goto(`/season/2026/series/${SAMPLE_2026_FINAL_SERIES_ID}`);

    const flow = page.getByRole('region', { name: 'シリーズの流れ' });
    await expect(flow).toBeVisible();

    // All three charts render, including the predicted win-probability trend.
    await expect(flow.getByRole('img', { name: DIFF_CHART })).toBeVisible();
    await expect(flow.getByRole('img', { name: TREND_CHART })).toBeVisible();
    await expect(flow.getByRole('img', { name: PROB_CHART })).toBeVisible();

    // Open the probability data table and assert its probability column renders
    // percentage values.
    const probFigure = flow
      .locator('.series-flow__figure')
      .filter({ has: page.getByRole('img', { name: PROB_CHART }) });
    await probFigure.locator('.series-flow__table-toggle').click();
    const probTable = probFigure.locator('table');
    await expect(probTable).toBeVisible();
    await expect(probTable).toContainText('%');
  });

  test('captures a dark-mode detail screenshot with charts for legibility review', async ({
    page,
  }) => {
    await page.addInitScript(
      ([key, value]) => {
        window.localStorage.setItem(key, value);
      },
      [THEME_STORAGE_KEY, 'dark'] as const,
    );
    await page.goto('/season/2024/series/2024-al-wildcard-117-116');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    const flow = page.getByRole('region', { name: 'シリーズの流れ' });
    await expect(flow).toBeVisible();
    await expect(flow.getByRole('img', { name: DIFF_CHART })).toBeVisible();

    await page.screenshot({
      path: 'test-results/series-flow-dark.png',
      fullPage: true,
    });
  });
});

test.describe('score-diff sparkline on the bracket', () => {
  test('a bracket card shows the score-diff sparkline (role=img)', async ({
    page,
  }) => {
    await stubBracket2026(page);
    await page.goto('/');

    // The FINAL ALCS card has games, so its card renders a sparkline.
    const finalCard = page.locator(
      `[data-series-id="${SAMPLE_2026_FINAL_SERIES_ID}"]`,
    );
    await expect(finalCard).toBeVisible();

    const sparkline = finalCard.getByRole('img', {
      name: /得点差スパークライン/,
    });
    await expect(sparkline).toBeVisible();
    // Decorative: it adds no tab stop (no tabindex, no interactive children).
    await expect(sparkline).not.toHaveAttribute('tabindex', /.*/);
  });
});
