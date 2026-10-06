import { test, expect } from '@playwright/test';
import {
  SAMPLE_2026_UNKNOWN_SERIES_ID,
  stubBracket2026,
} from './fixtures';

/**
 * JA/EN language switch coverage.
 *
 * The default UI language is Japanese. The header exposes a role=group language
 * toggle; switching re-renders every visible string live and persists the
 * choice to localStorage so it survives a reload. An unknown/preview team id
 * must render a LOCALIZED placeholder in both languages (never "Team <id>").
 */
test.describe('language switch (i18n)', () => {
  test('toggles JA/EN, persists across reload, and keeps aria-pressed in sync', async ({
    page,
  }) => {
    await stubBracket2026(page);
    await page.goto('/');

    const group = page.getByRole('group', { name: /言語|language/i });
    const ja = group.getByRole('button', { name: '日本語' });
    const en = group.getByRole('button', { name: 'English' });

    // Default language is Japanese.
    await expect(ja).toHaveAttribute('aria-pressed', 'true');
    await expect(en).toHaveAttribute('aria-pressed', 'false');

    // A representative visible string: the season selector label renders in JA.
    await expect(page.getByText('シーズン', { exact: true })).toBeVisible();

    // Switch to English: the same label changes language live.
    await en.click();
    await expect(en).toHaveAttribute('aria-pressed', 'true');
    await expect(ja).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByText('Season', { exact: true })).toBeVisible();
    // A localized round heading also flips to English.
    await expect(
      page.getByRole('heading', { name: 'World Series', exact: true }).first(),
    ).toBeVisible();

    // The choice persists across a reload (localStorage).
    await page.reload();
    await expect(
      page.getByRole('group', { name: /言語|language/i }).getByRole('button', {
        name: 'English',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Season', { exact: true })).toBeVisible();
  });

  test('an unknown/preview team id renders a localized placeholder, never "Team <id>"', async ({
    page,
  }) => {
    await stubBracket2026(page);
    await page.goto('/');

    const unknownCard = page.locator(
      `[data-series-id="${SAMPLE_2026_UNKNOWN_SERIES_ID}"]`,
    );
    await expect(unknownCard).toBeVisible();

    // Japanese default: "未定 (#5513)" and never the raw "Team 5513".
    await expect(unknownCard).toContainText('未定 (#5513)');
    await expect(unknownCard).not.toContainText('Team 5513');

    // Switch to English: "TBD (#5513)" and still never "Team 5513".
    await page
      .getByRole('group', { name: /言語|language/i })
      .getByRole('button', { name: 'English' })
      .click();
    await expect(unknownCard).toContainText('TBD (#5513)');
    await expect(unknownCard).not.toContainText('Team 5513');
  });
});
