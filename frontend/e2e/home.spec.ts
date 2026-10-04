import { test, expect } from '@playwright/test';

/**
 * App load, image assets, season selector, full bracket, and offline-fallback
 * coverage.
 *
 * No backend runs during E2E. The default season is the current year (2026),
 * which has no offline seed, so these specs drive the season selector to a
 * completed, results-only season (2024 / 2025) where `getBracket` falls back to
 * the bundled `@mlb/shared` seed and the app shows the offline notice.
 */
test.describe('home / bracket', () => {
  test('loads the app shell with brand + hero image assets', async ({ page }) => {
    await page.goto('/');

    // Title header renders regardless of the fetched season.
    await expect(
      page.getByRole('heading', { name: 'MLB Postseason Pulse' }),
    ).toBeVisible();

    // Brand logo and hero are real image assets with localized alt text. The
    // default UI language is Japanese, so the accessible names are the ja alts
    // (app.logoAlt / app.heroAlt in i18n/messages.ts).
    const brand = page.getByRole('img', { name: /ロゴ/ });
    await expect(brand).toBeVisible();
    await expect(brand).toHaveAttribute('src', /\.svg/);

    const hero = page.getByRole('img', { name: /野球場/ });
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

  test('offers a season selector for 2024, 2025 and 2026, defaulting to 2026', async ({
    page,
  }) => {
    await page.goto('/');

    const group = page.getByTestId('season-group');
    await expect(group.getByRole('button', { name: '2024' })).toBeVisible();
    await expect(group.getByRole('button', { name: '2025' })).toBeVisible();
    const current = group.getByRole('button', { name: '2026' });
    await expect(current).toBeVisible();
    // 2026 (current year) is selected by default.
    await expect(current).toHaveAttribute('aria-pressed', 'true');
  });

  test('shows the offline-fallback notice for a results-only season (2024)', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('season-group').getByRole('button', {
      name: '2024',
    }).click();

    // Offline notice text is localized (default language is Japanese).
    await expect(page.getByText(/オフラインの収録データ/)).toBeVisible();
  });

  test('renders all four rounds and AL/NL/WS lanes for 2024', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('season-group').getByRole('button', {
      name: '2024',
    }).click();

    const bracket = page.getByRole('region', { name: /トーナメント表/ });
    await expect(bracket).toBeVisible();

    // Round headings are localized; the default UI language is Japanese.
    for (const round of [
      'ワイルドカード',
      '地区シリーズ',
      'リーグ優勝決定シリーズ',
      'ワールドシリーズ',
    ]) {
      await expect(
        bracket.getByRole('heading', { name: round, exact: true }).first(),
      ).toBeVisible();
    }

    // League legend covers AL, NL and WS lanes (localized alt text).
    await expect(page.getByRole('img', { name: 'アメリカンリーグ' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'ナショナルリーグ' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'ワールドシリーズ' })).toBeVisible();
  });

  test('2024 is results-only: WS card shows Dodgers over Yankees 4-1 and no Predict button', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('season-group').getByRole('button', {
      name: '2024',
    }).click();

    const wsCard = page.locator(
      '[data-series-id="2024-ws-worldseries-119-147"]',
    );
    await expect(wsCard).toBeVisible();
    await expect(wsCard).toContainText('Los Angeles Dodgers');
    await expect(wsCard).toContainText('New York Yankees');
    // Series meta shows the 4-1 result (high wins - low wins).
    await expect(wsCard.locator('.series-card__meta')).toContainText('4');
    await expect(wsCard.locator('.series-card__meta')).toContainText('1');

    // Results-only: no interactive Predict affordance, and no prediction panel.
    // Labels are localized (default language is Japanese).
    await expect(
      wsCard.getByRole('button', { name: /予測/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('region', { name: /勝敗予測/ }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('region', { name: /最終結果/ }),
    ).toBeVisible();

    await wsCard.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'test-results/bracket-2024.png',
      fullPage: true,
    });
  });

  test('2025 is results-only: WS card shows Dodgers over Blue Jays 4-3', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('season-group').getByRole('button', {
      name: '2025',
    }).click();

    const wsCard = page.locator(
      '[data-series-id="2025-ws-worldseries-141-119"]',
    );
    await expect(wsCard).toBeVisible();
    await expect(wsCard).toContainText('Los Angeles Dodgers');
    await expect(wsCard).toContainText('Toronto Blue Jays');
    // Blue Jays (high) 3 - Dodgers (low) 4: the meta shows both.
    await expect(wsCard.locator('.series-card__meta')).toContainText('3');
    await expect(wsCard.locator('.series-card__meta')).toContainText('4');

    await expect(
      wsCard.getByRole('button', { name: /予測/ }),
    ).toHaveCount(0);

    await page.screenshot({
      path: 'test-results/bracket-2025.png',
      fullPage: true,
    });
  });

  test('game-detail lists are collapsed by default on the 2024 bracket', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('season-group').getByRole('button', {
      name: '2024',
    }).click();

    // Wait for the 2024 bracket to render before inspecting the cards.
    await expect(
      page.getByRole('region', { name: /トーナメント表/ }),
    ).toBeVisible();

    // Every rendered game list starts hidden (collapsed-by-default), so cards
    // stay compact and columns line up cleanly (the "gatagata" fix).
    const lists = page.locator('.series-card__games');
    await expect(lists.first()).toBeAttached();
    const count = await lists.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(lists.nth(i)).toBeHidden();
    }
    // Every "show games" toggle (localized "試合を表示") reports the collapsed
    // state. Match structurally by class to stay language-agnostic.
    const toggles = page.locator('.series-card__games-toggle');
    await expect(toggles.first()).toHaveAttribute('aria-expanded', 'false');

    // Full-page screenshot of the aligned, collapsed bracket for visual review.
    await page.screenshot({
      path: 'test-results/bracket-2024-collapsed.png',
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
