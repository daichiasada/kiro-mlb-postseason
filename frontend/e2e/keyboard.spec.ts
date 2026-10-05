import { test, expect } from '@playwright/test';
import {
  SAMPLE_2026_FINAL_SERIES_ID,
  SAMPLE_2026_UNKNOWN_SERIES_ID,
  stubBracket2026,
} from './fixtures';

/**
 * Keyboard navigation + screen-reader labelling coverage for the bracket.
 *
 * The 2026 bracket is stubbed offline (an in-progress World Series, a FINAL
 * ALCS, and an in-progress NL Division Series). buildRoundColumns renders the
 * non-empty rounds in progression order, so the columns are:
 *   col 0 = Division Series (NL, in progress)
 *   col 1 = Championship Series (AL, FINAL)   <- our Enter target
 *   col 2 = World Series (in progress)
 * Exactly one card is in the tab order at a time (roving tabindex); Tab reaches
 * it, arrow keys move the roving focus, and Enter on the FINAL card opens the
 * series detail route.
 */
test.describe('bracket keyboard navigation', () => {
  test('uses a roving tabindex (exactly one card tabbable)', async ({ page }) => {
    await stubBracket2026(page);
    await page.goto('/');

    const bracket = page.getByRole('region', { name: /トーナメント表/ });
    await expect(bracket).toBeVisible();

    const cards = page.locator('.series-card');
    await expect(cards).toHaveCount(3);
    // Roving tabindex: a single card is tabbable, the rest are removed from the
    // tab order.
    await expect(page.locator('.series-card[tabindex="0"]')).toHaveCount(1);
    await expect(page.locator('.series-card[tabindex="-1"]')).toHaveCount(2);
  });

  test('tabs/arrows to a FINAL series and Enter opens its detail route', async ({
    page,
  }) => {
    await stubBracket2026(page);
    await page.goto('/');

    const firstCard = page.locator('.series-card[tabindex="0"]');
    await expect(firstCard).toBeVisible();

    // Move DOM focus onto the single roving card, then step right one column to
    // the FINAL Championship Series card using the arrow keys.
    await firstCard.focus();
    await page.keyboard.press('ArrowRight');

    const finalCard = page.locator(
      `[data-series-id="${SAMPLE_2026_FINAL_SERIES_ID}"]`,
    );
    // The final card is now the focused, roving-tabbable element.
    await expect(finalCard).toBeFocused();
    await expect(finalCard).toHaveAttribute('tabindex', '0');

    // Enter activates the focused FINAL card -> navigate to its detail page.
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(
      new RegExp(`/season/2026/series/${SAMPLE_2026_FINAL_SERIES_ID}$`),
    );
    // The detail page renders (localized region name embeds the club names).
    await expect(
      page.getByRole('region', {
        name: /houston astros .* seattle mariners .*詳細/i,
      }),
    ).toBeVisible();
  });

  test('ArrowDown stays within a column and the card announces teams, status and score', async ({
    page,
  }) => {
    await stubBracket2026(page);
    await page.goto('/');

    // Each stubbed round holds a single series, so ArrowDown is a no-op (clamped)
    // and focus remains on the first card - proving movement does not escape the
    // column or wrap unexpectedly.
    const firstCard = page.locator('.series-card[tabindex="0"]');
    await firstCard.focus();
    await page.keyboard.press('ArrowDown');
    await expect(firstCard).toBeFocused();

    // The FINAL card's accessible name announces both teams, the localized
    // status ("終了"), and the series score (4-2). Club names stay English.
    const finalCard = page.locator(
      `[data-series-id="${SAMPLE_2026_FINAL_SERIES_ID}"]`,
    );
    const label = await finalCard.getAttribute('aria-label');
    expect(label).toMatch(/Houston Astros/);
    expect(label).toMatch(/Seattle Mariners/);
    expect(label).toMatch(/終了/);
    expect(label).toMatch(/4–2/);

    // The navigable region exposes the localized keyboard-usage instructions.
    await expect(
      page.getByRole('group', { name: /矢印キーでシリーズ間を移動/ }),
    ).toBeVisible();

    // The unknown-team series still renders (sanity that the grid is complete).
    await expect(
      page.locator(`[data-series-id="${SAMPLE_2026_UNKNOWN_SERIES_ID}"]`),
    ).toBeVisible();
  });
});
