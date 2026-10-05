import { test, expect } from '@playwright/test';
import { SAMPLE_2026_FINAL_SERIES_ID, stubBracket2026 } from './fixtures';

/**
 * Share control + language-aware permalink coverage (Issue #21, FEAT-003).
 *
 * The finished-series detail page renders a localized Share button. We stub the
 * Web Share API (and clipboard) with an init script that runs BEFORE the SPA
 * loads, recording the shared/copied URL on `window`, then click Share and
 * assert the captured URL carries both the series id and the active `lang=`.
 * Separately we deep-link with ?lang=ja / ?lang=en and assert a known
 * language-only string renders, proving the SPA honors ?lang= on load.
 */
test.describe('share control', () => {
  test('Share is visible and shares a lang-tagged permalink containing the series id', async ({
    page,
  }) => {
    await stubBracket2026(page);

    // Stub navigator.share before any app code runs; record the shared payload.
    await page.addInitScript(() => {
      (window as unknown as { __shared?: unknown }).__shared = undefined;
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: (data: unknown) => {
          (window as unknown as { __shared?: unknown }).__shared = data;
          return Promise.resolve();
        },
      });
    });

    await page.goto(
      `/season/2026/series/${SAMPLE_2026_FINAL_SERIES_ID}?lang=en`,
    );

    const shareButton = page.locator('.share__button').first();
    await expect(shareButton).toBeVisible();
    await shareButton.click();

    const sharedUrl = await page.evaluate(
      () =>
        (window as unknown as { __shared?: { url?: string } }).__shared?.url ??
        '',
    );
    expect(sharedUrl).toContain(SAMPLE_2026_FINAL_SERIES_ID);
    expect(sharedUrl).toContain('lang=en');
  });

  test('falls back to clipboard and copies a lang-tagged permalink when Web Share is absent', async ({
    page,
  }) => {
    await stubBracket2026(page);

    // Remove Web Share and stub the clipboard, recording the copied text.
    await page.addInitScript(() => {
      // Ensure navigator.share is absent so the copy fallback is exercised.
      try {
        // @ts-expect-error - deleting the optional Web Share API in the stub.
        delete navigator.share;
      } catch {
        /* ignore */
      }
      (window as unknown as { __copied?: string }).__copied = '';
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: (text: string) => {
            (window as unknown as { __copied?: string }).__copied = text;
            return Promise.resolve();
          },
        },
      });
    });

    await page.goto(
      `/season/2026/series/${SAMPLE_2026_FINAL_SERIES_ID}?lang=ja`,
    );

    const shareButton = page.locator('.share__button').first();
    await expect(shareButton).toBeVisible();
    await shareButton.click();

    // The localized "copied" confirmation appears (Japanese).
    await expect(page.getByText('リンクをコピーしました').first()).toBeVisible();

    const copied = await page.evaluate(
      () => (window as unknown as { __copied?: string }).__copied ?? '',
    );
    expect(copied).toContain(SAMPLE_2026_FINAL_SERIES_ID);
    expect(copied).toContain('lang=ja');
  });

  test('?lang=ja opens the app in Japanese and ?lang=en in English', async ({
    page,
  }) => {
    await stubBracket2026(page);

    // Japanese: the detail page shows the localized "Game by game" heading.
    await page.goto(
      `/season/2026/series/${SAMPLE_2026_FINAL_SERIES_ID}?lang=ja`,
    );
    await expect(
      page.getByRole('heading', { name: '試合ごとの詳細' }),
    ).toBeVisible();

    // English: the same heading renders in English.
    await page.goto(
      `/season/2026/series/${SAMPLE_2026_FINAL_SERIES_ID}?lang=en`,
    );
    await expect(
      page.getByRole('heading', { name: 'Game by game' }),
    ).toBeVisible();
  });
});
