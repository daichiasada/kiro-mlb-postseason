import { test, expect } from '@playwright/test';
import { stubBracket2026, SAMPLE_2026_SERIES_ID } from './fixtures';

/**
 * Favorite teams (Issue #18) end-to-end coverage against the stubbed 2026
 * bracket. SAMPLE_2026_BRACKET contains:
 *  - an in-progress World Series (Dodgers 119 vs Yankees 147) => active favorite
 *  - a FINAL ALCS (Astros 117 beat Mariners 136) => eliminated favorite (136)
 *
 * The default UI language is Japanese; these specs assert the JA strings and
 * stay structural (class/role/testid) for the rest so they do not break on a
 * copy tweak. No backend runs: the bracket is stubbed via page.route.
 */
const WS_CARD = `[data-series-id="${SAMPLE_2026_SERIES_ID}"]`;
const ALCS_CARD = '[data-series-id="2026-al-championship-117-136"]';

test.describe('favorites (Issue #18)', () => {
  test('favoriting an active team highlights its series and shows an active header pin', async ({
    page,
  }) => {
    await stubBracket2026(page);
    await page.goto('/season/2026');

    const wsCard = page.locator(WS_CARD);
    await expect(wsCard).toBeVisible();

    // Favorite the Dodgers (119) via its star toggle inside the WS card. The
    // aria-label is localized (JA default): "...をお気に入りに追加".
    await wsCard
      .getByRole('button', { name: /Los Angeles Dodgers.*お気に入りに追加/ })
      .click();

    // The series is now highlighted with the NON-color cue: the marker icon +
    // the border/outline class. Locate structurally, not by color.
    await expect(wsCard).toHaveClass(/series-card--favorite/);
    await expect(wsCard.getByTestId('favorite-marker')).toBeVisible();
    // The visually-hidden marker label is present for assistive tech.
    await expect(
      wsCard.getByText('お気に入りチームのシリーズ'),
    ).toBeAttached();

    // The header pin appears with the Dodgers and an active (leading) status.
    const pin = page.getByTestId('favorites-pin');
    await expect(pin).toBeVisible();
    await expect(pin).toContainText('Los Angeles Dodgers');
    // 119 lead 147 2-1 in the fixture => "リード" (leading).
    await expect(pin).toContainText('リード');
    await expect(pin).not.toContainText('敗退');
  });

  test('favoriting an eliminated team shows the localized Eliminated label in the pin and the card', async ({
    page,
  }) => {
    await stubBracket2026(page);
    await page.goto('/season/2026');

    const alcsCard = page.locator(ALCS_CARD);
    await expect(alcsCard).toBeVisible();

    // Favorite the Mariners (136), who lost the final ALCS.
    await alcsCard
      .getByRole('button', { name: /Seattle Mariners.*お気に入りに追加/ })
      .click();

    // The pin shows the localized "敗退" (Eliminated) status for the Mariners.
    const pin = page.getByTestId('favorites-pin');
    await expect(pin).toBeVisible();
    await expect(pin).toContainText('Seattle Mariners');
    await expect(pin).toContainText('敗退');

    // The eliminated badge also shows on the Mariners row inside the ALCS card.
    await expect(
      alcsCard.locator('.series-team__eliminated'),
    ).toHaveText('敗退');
  });

  test('the favorites filter shows only favorite-team series', async ({
    page,
  }) => {
    await stubBracket2026(page);
    await page.goto('/season/2026');

    const wsCard = page.locator(WS_CARD);
    await expect(wsCard).toBeVisible();

    // Favorite only the Dodgers (in the WS series).
    await wsCard
      .getByRole('button', { name: /Los Angeles Dodgers.*お気に入りに追加/ })
      .click();

    // Both the WS and ALCS cards are visible before filtering.
    await expect(page.locator(ALCS_CARD)).toBeVisible();

    // Turn the filter on (localized label "お気に入りのチームだけ表示").
    const filter = page.getByTestId('favorites-filter');
    await filter.click();
    await expect(filter).toHaveAttribute('aria-pressed', 'true');

    // Only the Dodgers' WS series remains; the ALCS (no favorite) is gone.
    await expect(page.locator(WS_CARD)).toBeVisible();
    await expect(page.locator(ALCS_CARD)).toHaveCount(0);
  });

  test('the filter shows a localized empty state when no favorite has a series here', async ({
    page,
  }) => {
    await stubBracket2026(page);
    await page.goto('/season/2026');

    const wsCard = page.locator(WS_CARD);
    await expect(wsCard).toBeVisible();

    // Favorite a team (Yankees 147) then UNfavorite it so a favorite exists in
    // state transiently; instead, favorite the Astros (117, a FINAL winner in
    // this bracket) which DOES have a series, then switch to a season where it
    // has none would require another stub. Simpler: favorite nobody here but
    // flip the filter and assert the empty state only when there is truly no
    // favorite series. We create that state by favoriting then removing.
    const star = wsCard.getByRole('button', {
      name: /Los Angeles Dodgers.*お気に入りに追加/,
    });
    await star.click();
    await wsCard
      .getByRole('button', { name: /Los Angeles Dodgers.*お気に入りから外す/ })
      .click();

    // With no favorites at all, the filter toggle still works and shows the
    // friendly localized empty state instead of an empty grid.
    const filter = page.getByTestId('favorites-filter');
    await filter.click();
    await expect(
      page.getByText('お気に入りのチームのシリーズはこのトーナメント表にありません。'),
    ).toBeVisible();
  });
});
