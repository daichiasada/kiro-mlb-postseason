import { test, expect } from '@playwright/test';
import {
  SAMPLE_2026_FINAL_SERIES_ID,
  stubBracket2026,
  stubGameDetail,
  stubGameDetailError,
} from './fixtures';

/**
 * Per-game accordion coverage (Issue #19) on the finished-series detail page.
 *
 * The 2026 bracket is stubbed (its FINAL ALCS has games 800001/800002). The
 * detail page re-fetches the bracket for the route's season, so the same stub
 * serves it. The `/game` endpoint is stubbed per-test to the `ok`, error, and
 * (implicitly) narrow-viewport scenarios.
 */
test.describe('game-detail accordion', () => {
  test('expands a game and renders the inning table + pitchers (ok)', async ({
    page,
  }) => {
    await stubBracket2026(page);
    await stubGameDetail(page);
    await page.goto(`/season/2026/series/${SAMPLE_2026_FINAL_SERIES_ID}`);

    const firstGame = page.locator('.detail__game').first();
    const toggle = firstGame.locator('.detail__game-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    // The final score line is always visible even while collapsed.
    await expect(toggle).toContainText('HOU 5');
    await expect(toggle).toContainText('SEA 3');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const panel = firstGame.locator('.detail__game-panel');
    // Venue + pitchers render.
    await expect(panel).toContainText('Daikin Park');
    await expect(panel).toContainText('Framber Valdez');
    await expect(panel).toContainText('Josh Hader');

    // The inning R/H/E table renders inside the scroll container.
    const table = panel.locator('.detail__linescore-scroll table');
    await expect(table).toBeVisible();
    await expect(table).toContainText('1st');
  });

  test('shows an inline error note while keeping the final score (criterion 2)', async ({
    page,
  }) => {
    await stubBracket2026(page);
    await stubGameDetailError(page);
    await page.goto(`/season/2026/series/${SAMPLE_2026_FINAL_SERIES_ID}`);

    const firstGame = page.locator('.detail__game').first();
    const toggle = firstGame.locator('.detail__game-toggle');
    await toggle.click();

    const panel = firstGame.locator('.detail__game-panel');
    await expect(panel.locator('.detail__game-status--error')).toBeVisible();
    // The final score stays visible on failure.
    await expect(toggle).toContainText('HOU 5');
    // No inning table on failure.
    await expect(panel.locator('table')).toHaveCount(0);
  });

  test('the inning table scrolls at 375px without page-level horizontal overflow (criterion 3)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await stubBracket2026(page);
    await stubGameDetail(page);
    await page.goto(`/season/2026/series/${SAMPLE_2026_FINAL_SERIES_ID}`);

    const firstGame = page.locator('.detail__game').first();
    const toggle = firstGame.locator('.detail__game-toggle');
    await toggle.click();

    const scroll = firstGame.locator('.detail__linescore-scroll');
    await expect(scroll).toBeVisible();

    // The container is horizontally scrollable (either the content overflows,
    // or the computed overflow-x permits scrolling).
    const scrollable = await scroll.evaluate((el) => {
      const style = getComputedStyle(el);
      const overflowX = style.overflowX;
      return (
        el.scrollWidth > el.clientWidth ||
        overflowX === 'auto' ||
        overflowX === 'scroll'
      );
    });
    expect(scrollable).toBe(true);

    // The page body itself does NOT overflow horizontally at 375px.
    const noPageOverflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth <= window.innerWidth + 1;
    });
    expect(noPageOverflow).toBe(true);
  });
});
