import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';
import {
  SAMPLE_2026_FINAL_SERIES_ID,
  stubBracket2026,
} from './fixtures';
import { THEME_STORAGE_KEY, type ResolvedTheme } from '../src/theme';

/**
 * Automated accessibility verification (Issue #22, criterion (2)+(3)).
 *
 * For the three main surfaces - the home bracket, a finished-series detail
 * page, and the model-accuracy page - we run an `@axe-core/playwright` scan in
 * BOTH the light and the dark theme and assert there are ZERO violations with
 * impact `'serious'` or `'critical'`. The theme is driven by seeding
 * localStorage `mlb.theme` BEFORE the SPA boots (via `addInitScript`), and we
 * confirm `document.documentElement[data-theme]` is the expected value before
 * scanning so the axe run actually reflects the palette under test.
 *
 * The suite is fully offline: the home bracket uses the bundled `@mlb/shared`
 * 2024 seed (results-only, no backend), and the detail page's bracket is
 * stubbed via `page.route` (see `fixtures.ts`). No backend, Bedrock, or live
 * MLB call is involved.
 */

/** Impacts that must never appear in either theme. */
const BLOCKING_IMPACTS = ['serious', 'critical'] as const;

/**
 * Seeds the persisted theme preference so the ThemeProvider hydrates straight
 * into the requested palette, then navigates and asserts the applied theme.
 * Setting the preference to the literal `'light'`/`'dark'` (not `'system'`)
 * makes the resolved theme deterministic regardless of the headless browser's
 * OS color scheme.
 */
async function gotoWithTheme(
  page: Page,
  path: string,
  theme: ResolvedTheme,
): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    [THEME_STORAGE_KEY, theme] as const,
  );
  await page.goto(path);
  // The provider applies the resolved theme to <html data-theme> on mount.
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

/**
 * Scans the current page with axe and returns the violations whose impact is
 * `serious` or `critical`. Scoped to WCAG 2.1 A/AA rule tags.
 */
async function blockingViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return results.violations.filter((v) =>
    (BLOCKING_IMPACTS as readonly string[]).includes(v.impact ?? ''),
  );
}

/** A readable summary of a violation set for failing-test diagnostics. */
function summarize(violations: Awaited<ReturnType<typeof blockingViolations>>) {
  return violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target).flat(),
  }));
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`accessibility (${theme} theme)`, () => {
    test(`home bracket has no serious/critical axe violations (${theme})`, async ({
      page,
    }) => {
      // Use a results-only season (2024) so the full bracket renders offline
      // from the bundled seed rather than the empty "upcoming" default season.
      await gotoWithTheme(page, '/', theme);
      await page
        .getByTestId('season-group')
        .getByRole('button', { name: '2024' })
        .click();
      await expect(
        page.getByRole('region', { name: /トーナメント表/ }),
      ).toBeVisible();

      const violations = await blockingViolations(page);
      expect(summarize(violations)).toEqual([]);
    });

    test(`series detail page has no serious/critical axe violations (${theme})`, async ({
      page,
    }) => {
      await stubBracket2026(page);
      await gotoWithTheme(
        page,
        `/season/2026/series/${SAMPLE_2026_FINAL_SERIES_ID}`,
        theme,
      );
      await expect(
        page.getByRole('region', {
          name: /houston astros .* seattle mariners .*詳細/i,
        }),
      ).toBeVisible();

      const violations = await blockingViolations(page);
      expect(summarize(violations)).toEqual([]);
    });

    test(`accuracy page has no serious/critical axe violations (${theme})`, async ({
      page,
    }) => {
      await gotoWithTheme(page, '/accuracy', theme);
      await expect(
        page.getByRole('region', { name: /モデル精度とバックテスト結果/ }),
      ).toBeVisible();

      const violations = await blockingViolations(page);
      expect(summarize(violations)).toEqual([]);
    });
  });
}

test.describe('dark-mode visual legibility (criterion 3)', () => {
  test('captures a dark-mode home bracket screenshot for connector/logo review', async ({
    page,
  }) => {
    await gotoWithTheme(page, '/', 'dark');
    await page
      .getByTestId('season-group')
      .getByRole('button', { name: '2024' })
      .click();
    await expect(
      page.getByRole('region', { name: /トーナメント表/ }),
    ).toBeVisible();

    // The league marks (AL/NL/WS) sit on their own colored discs, so they must
    // remain visible on the dark background.
    await expect(
      page.getByRole('img', { name: 'アメリカンリーグ' }),
    ).toBeVisible();
    await expect(page.getByRole('img', { name: 'ナショナルリーグ' })).toBeVisible();

    // Diagnostic full-page screenshot (test-results is gitignored) so the
    // bracket connectors/borders and SVG logos can be inspected in dark mode.
    await page.screenshot({
      path: 'test-results/home-dark.png',
      fullPage: true,
    });
  });
});
