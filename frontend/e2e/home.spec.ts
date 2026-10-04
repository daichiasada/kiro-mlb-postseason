import { test, expect } from '@playwright/test';

/**
 * App load, image assets, full bracket, and offline-fallback coverage.
 *
 * No backend runs during E2E, so `getBracket` falls back to the bundled
 * `@mlb/shared` 2024 seed and the app shows an offline notice.
 */
test.describe('home / bracket', () => {
  test('loads the app shell with brand + hero image assets', async ({ page }) => {
    await page.goto('/');

    // Title header renders.
    await expect(
      page.getByRole('heading', { name: 'MLB Postseason Pulse' }),
    ).toBeVisible();

    // Brand logo and hero are real image assets with meaningful alt text.
    const brand = page.getByRole('img', { name: /logo/i });
    await expect(brand).toBeVisible();
    await expect(brand).toHaveAttribute('src', /\.svg/);

    const hero = page.getByRole('img', { name: /baseball diamond/i });
    await expect(hero).toHaveCount(1);

    // Every <img> in the document must have non-empty alt text.
    const imgsMissingAlt = await page
      .locator('img:not([alt]), img[alt=""]')
      .count();
    expect(imgsMissingAlt).toBe(0);

    await page.screenshot({
      path: 'test-results/home-full.png',
      fullPage: true,
    });
  });

  test('shows the offline-fallback notice (no backend)', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByText(/bundled offline data/i),
    ).toBeVisible();
  });

  test('renders all four rounds and AL/NL/WS lanes', async ({ page }) => {
    await page.goto('/');

    const bracket = page.getByRole('region', { name: /postseason bracket/i });
    await expect(bracket).toBeVisible();

    for (const round of [
      'Wild Card',
      'Division Series',
      'Championship Series',
      'World Series',
    ]) {
      await expect(
        bracket.getByRole('heading', { name: round, exact: true }).first(),
      ).toBeVisible();
    }

    // League legend covers AL, NL and WS lanes.
    await expect(page.getByRole('img', { name: 'American League' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'National League' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'World Series' })).toBeVisible();
  });

  test('World Series card shows Dodgers over Yankees 4-1', async ({ page }) => {
    await page.goto('/');

    const wsCard = page.locator(
      '[data-series-id="2024-ws-worldseries-119-147"]',
    );
    await expect(wsCard).toBeVisible();
    await expect(wsCard).toContainText('Los Angeles Dodgers');
    await expect(wsCard).toContainText('New York Yankees');
    // Series meta shows the 4-1 result (high wins - low wins).
    await expect(wsCard.locator('.series-card__meta')).toContainText('4');
    await expect(wsCard.locator('.series-card__meta')).toContainText('1');

    await wsCard.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'test-results/bracket-full.png',
      fullPage: true,
    });
  });

  test('does not overflow horizontally at a narrow mobile width', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'MLB Postseason Pulse' }),
    ).toBeVisible();

    // The document should not scroll horizontally on a phone-width viewport.
    const overflow = await page.evaluate(() => {
      const el = document.documentElement;
      return el.scrollWidth - el.clientWidth;
    });
    // Allow a 1px rounding tolerance.
    expect(overflow).toBeLessThanOrEqual(1);

    await page.screenshot({
      path: 'test-results/home-mobile.png',
      fullPage: true,
    });
  });
});
