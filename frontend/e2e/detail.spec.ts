import { test, expect } from '@playwright/test';
import {
  SAMPLE_2026_FINAL_SERIES_ID,
  SAMPLE_2026_SERIES_ID,
  stubBracket2026,
} from './fixtures';

/**
 * Game-detail toggle and finished-series detail-page coverage.
 *
 * The 2026 bracket is stubbed (its /bracket route returns an in-progress World
 * Series plus a FINAL ALCS). The detail page re-fetches the bracket for the
 * route's season, so the same stub serves it. Routing is path-based
 * (BrowserRouter); the preview server falls back unknown routes to index.html.
 */
test.describe('game-detail toggle', () => {
  test('per-series game list is collapsed by default and toggles open', async ({
    page,
  }) => {
    await stubBracket2026(page);
    await page.goto('/');

    const finalCard = page.locator(
      `[data-series-id="${SAMPLE_2026_FINAL_SERIES_ID}"]`,
    );
    await expect(finalCard).toBeVisible();

    // The single toggle button inside the card (its label flips, so match it
    // structurally rather than by name). Labels are localized (default: ja).
    const toggle = finalCard.locator('.series-card__games-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveText(/試合を表示/);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    // Collapsed by default: the controlled game list is not visible.
    const listId = await toggle.getAttribute('aria-controls');
    const list = page.locator(`#${listId}`);
    await expect(list).toBeHidden();

    // Expand: aria-expanded flips, the label becomes "Hide games", and the
    // game list appears.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle).toHaveText(/試合を隠す/);
    await expect(list).toBeVisible();
    await expect(list).toContainText('G1');

    // Collapse again.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(list).toBeHidden();
  });
});

test.describe('finished-series detail page', () => {
  test('navigates to the detail page from a final series and back', async ({
    page,
  }) => {
    await stubBracket2026(page);
    await page.goto('/');

    const finalCard = page.locator(
      `[data-series-id="${SAMPLE_2026_FINAL_SERIES_ID}"]`,
    );
    // The detail link label is localized; match it structurally.
    await finalCard.locator('.series-card__detail-link').click();

    // We are now on the dedicated detail page URL.
    await expect(page).toHaveURL(
      new RegExp(`/season/2026/series/${SAMPLE_2026_FINAL_SERIES_ID}$`),
    );

    // The region label embeds the English club names and the localized "詳細".
    const detail = page.getByRole('region', {
      name: /houston astros .* seattle mariners .*詳細/i,
    });
    await expect(detail).toBeVisible();
    // Series result (localized "がシリーズを … で制しました") + game-by-game
    // detail render on the page. Club names stay English in both languages.
    await expect(detail).toContainText(/Houston Astros/);
    await expect(detail).toContainText(/シリーズを/);
    await expect(detail.getByText('第1戦')).toBeVisible();
    await expect(detail.getByText('第2戦')).toBeVisible();

    await page.screenshot({
      path: 'test-results/series-detail.png',
      fullPage: true,
    });

    // Back link returns to the bracket for the same season (localized).
    await page.locator('.detail__back').first().click();
    await expect(page).toHaveURL(/\/season\/2026$/);
    await expect(
      page.locator(`[data-series-id="${SAMPLE_2026_SERIES_ID}"]`),
    ).toBeVisible();
  });

  test('deep-linking straight to a detail URL renders the series', async ({
    page,
  }) => {
    await stubBracket2026(page);
    await page.goto(`/season/2026/series/${SAMPLE_2026_FINAL_SERIES_ID}`);

    await expect(
      page.getByRole('region', {
        name: /houston astros .* seattle mariners .*詳細/i,
      }),
    ).toBeVisible();
    await expect(page.getByText('第1戦')).toBeVisible();
  });

  test('an unknown series id shows a friendly not-found message with a back link', async ({
    page,
  }) => {
    await stubBracket2026(page);
    await page.goto('/season/2026/series/does-not-exist');

    // Localized not-found region + hint (default language is Japanese).
    await expect(
      page.getByRole('region', { name: /シリーズが見つかりません/ }),
    ).toBeVisible();
    await expect(page.getByText(/シリーズは見つかりませんでした/)).toBeVisible();
    // Two back links exist on this page (breadcrumb + the in-body return link);
    // use the breadcrumb (first) to navigate back.
    await page.locator('.detail__back').first().click();
    await expect(page).toHaveURL(/\/season\/2026$/);
  });
});
