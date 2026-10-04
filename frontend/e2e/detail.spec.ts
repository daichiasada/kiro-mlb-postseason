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
    // structurally rather than by name).
    const toggle = finalCard.locator('.series-card__games-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveText(/show games/i);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    // Collapsed by default: the controlled game list is not visible.
    const listId = await toggle.getAttribute('aria-controls');
    const list = page.locator(`#${listId}`);
    await expect(list).toBeHidden();

    // Expand: aria-expanded flips, the label becomes "Hide games", and the
    // game list appears.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle).toHaveText(/hide games/i);
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
    await finalCard.getByRole('link', { name: /view series detail/i }).click();

    // We are now on the dedicated detail page URL.
    await expect(page).toHaveURL(
      new RegExp(`/season/2026/series/${SAMPLE_2026_FINAL_SERIES_ID}$`),
    );

    const detail = page.getByRole('region', {
      name: /houston astros versus seattle mariners detail/i,
    });
    await expect(detail).toBeVisible();
    // Series result + game-by-game detail render on the page.
    await expect(detail).toContainText(/Houston Astros/);
    await expect(detail).toContainText(/won the series/i);
    await expect(detail.getByText('Game 1')).toBeVisible();
    await expect(detail.getByText('Game 2')).toBeVisible();

    await page.screenshot({
      path: 'test-results/series-detail.png',
      fullPage: true,
    });

    // Back link returns to the bracket for the same season.
    await page.getByRole('link', { name: /back to the 2026 bracket/i }).click();
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
        name: /houston astros versus seattle mariners detail/i,
      }),
    ).toBeVisible();
    await expect(page.getByText('Game 1')).toBeVisible();
  });

  test('an unknown series id shows a friendly not-found message with a back link', async ({
    page,
  }) => {
    await stubBracket2026(page);
    await page.goto('/season/2026/series/does-not-exist');

    await expect(
      page.getByRole('region', { name: /series not found/i }),
    ).toBeVisible();
    await expect(page.getByText(/could not find a series/i)).toBeVisible();
    await page.getByRole('link', { name: /return to the 2026 bracket/i }).click();
    await expect(page).toHaveURL(/\/season\/2026$/);
  });
});
