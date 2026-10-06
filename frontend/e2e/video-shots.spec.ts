import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  SAMPLE_2026_FINAL_SERIES_ID,
  SAMPLE_2026_SERIES_ID,
  stubBracket2026,
  stubPredictionSuccess,
} from './fixtures';

/**
 * Hero screenshot capture for the NotebookLM promo video (judge-facing).
 *
 * This spec is NOT a behavioural test: its only job is to drive the SPA into a
 * handful of polished states and write committed PNGs into
 * docs/video/screenshots/ at the repo root (NOT frontend/test-results, which is
 * gitignored). It reuses the existing fully-offline stubs from fixtures.ts and
 * the headless-chromium + vite-preview webServer from playwright.config.ts, so
 * it needs no external MLB Stats API, Bedrock, or AWS access.
 *
 * Each shot waits for its key element to be visible first, uses a consistent
 * 1440x900 desktop viewport, and keeps the default Japanese UI language where
 * it best showcases the app. If a screen cannot be produced offline, capture
 * the closest achievable state and record the limitation in the feature
 * findings instead of failing the whole run.
 */

// docs/video/screenshots/ relative to this file (frontend/e2e/).
const SHOTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'docs',
  'video',
  'screenshots',
);

const DESKTOP = { width: 1440, height: 900 } as const;

function shotPath(name: string): string {
  return path.join(SHOTS_DIR, name);
}

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: shotPath(name), fullPage: true });
}

test.describe('video hero shots', () => {
  test.use({ viewport: DESKTOP });

  test('bracket-overview: full 2024 bracket with all rounds and AL/NL/WS lanes', async ({
    page,
  }) => {
    await page.goto('/');
    await page
      .getByTestId('season-group')
      .getByRole('button', { name: '2024' })
      .click();

    const bracket = page.getByRole('region', { name: /トーナメント表/ });
    await expect(bracket).toBeVisible();
    // Confirm every round lane rendered before the shot.
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
    await expect(
      page.getByRole('img', { name: 'アメリカンリーグ' }),
    ).toBeVisible();

    await capture(page, 'bracket-overview.png');
  });

  test('series-detail: a completed series detail page with game-by-game results', async ({
    page,
  }) => {
    await stubBracket2026(page);
    await page.goto(`/season/2026/series/${SAMPLE_2026_FINAL_SERIES_ID}`);

    const detail = page.getByRole('region', {
      name: /houston astros .* seattle mariners .*詳細/i,
    });
    await expect(detail).toBeVisible();
    await expect(detail).toContainText(/Houston Astros/);
    await expect(detail.getByText('第1戦')).toBeVisible();
    await expect(detail.getByText('第2戦')).toBeVisible();

    await capture(page, 'series-detail.png');
  });

  test('ai-prediction: 2026 panel with favorite, probability bar, and narrative', async ({
    page,
  }) => {
    await stubBracket2026(page);
    await stubPredictionSuccess(page);
    await page.goto('/');

    const wsCard = page.locator(`[data-series-id="${SAMPLE_2026_SERIES_ID}"]`);
    await expect(wsCard).toBeVisible();
    await wsCard.locator('.series-card__predict').click();

    const panel = page.getByRole('region', { name: /勝敗予測/ });
    await expect(panel).toBeVisible();
    // Favorite team, labeled probability bar, visible percentage, narrative.
    await expect(
      panel.getByText('Los Angeles Dodgers', { exact: true }),
    ).toBeVisible();
    await expect(panel.getByRole('progressbar')).toBeVisible();
    await expect(panel.getByText(/68\.0%/)).toBeVisible();
    await expect(panel.getByText('予測の根拠')).toBeVisible();

    await capture(page, 'ai-prediction.png');
  });

  test('dark-mode: dark bracket rendered from the dark theme preference', async ({
    page,
  }) => {
    // Set the dark theme preference before the first paint, then load the
    // seed-backed 2024 bracket so the whole tournament renders in dark mode.
    await page.addInitScript(() => {
      window.localStorage.setItem('mlb.theme', 'dark');
    });
    await page.goto('/');
    await page
      .getByTestId('season-group')
      .getByRole('button', { name: '2024' })
      .click();

    const bracket = page.getByRole('region', { name: /トーナメント表/ });
    await expect(bracket).toBeVisible();
    // The dark preference is reflected on the document root.
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      /dark/,
    );

    await capture(page, 'dark-mode.png');
  });

  test('favorites: highlighted series card and active header pin', async ({
    page,
  }) => {
    await stubBracket2026(page);
    await page.goto('/season/2026');

    const wsCard = page.locator(`[data-series-id="${SAMPLE_2026_SERIES_ID}"]`);
    await expect(wsCard).toBeVisible();

    // Favorite the Dodgers (119) via the localized star toggle inside the card.
    await wsCard
      .getByRole('button', { name: /Los Angeles Dodgers.*お気に入りに追加/ })
      .click();

    // The series is highlighted and the header pin becomes active.
    await expect(wsCard).toHaveClass(/series-card--favorite/);
    const pin = page.getByTestId('favorites-pin');
    await expect(pin).toBeVisible();
    await expect(pin).toContainText('Los Angeles Dodgers');

    await capture(page, 'favorites.png');
  });
});
