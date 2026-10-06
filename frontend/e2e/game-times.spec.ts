import { test, expect } from '@playwright/test';
import {
  SAMPLE_2026_FINAL_SERIES_ID,
  SAMPLE_2026_UPCOMING_SERIES_ID,
  stubBracket2026WithGameTimes,
} from './fixtures';

/**
 * Local game-time coverage (Issue #20).
 *
 * The 2026 bracket is stubbed with concrete UTC `startTime`s on the FINAL ALCS
 * games and an extra in-progress NLCS carrying one timed upcoming game and one
 * time-TBD game (the timed game's start is set a few hours from the run clock so
 * it buckets into today/tomorrow deterministically). Because the runner's
 * timezone is unknown, we assert on the localized affordances and a time-ish
 * pattern rather than an exact clock value. No live calls are made.
 */
test.describe('local game times, today/tomorrow section, and .ics download', () => {
  async function switchToEnglish(page: import('@playwright/test').Page) {
    await page
      .getByRole('group', { name: /言語|language/i })
      .getByRole('button', { name: 'English' })
      .click();
    await expect(page.getByText('Season', { exact: true })).toBeVisible();
  }

  test('a finished game row shows a localized local time', async ({ page }) => {
    await stubBracket2026WithGameTimes(page);
    await page.goto('/');
    await switchToEnglish(page);

    const finalCard = page.locator(
      `[data-series-id="${SAMPLE_2026_FINAL_SERIES_ID}"]`,
    );
    await expect(finalCard).toBeVisible();

    // Reveal the collapsed games list.
    const toggle = finalCard.locator('.series-card__games-toggle');
    await toggle.click();
    const list = finalCard.locator('.series-card__games');
    await expect(list).toBeVisible();

    // Each game row renders a localized local time (en-US 12-hour clock -> an
    // AM/PM time-ish string). We do NOT assert an exact clock value: the runner
    // timezone is unknown, so only the shape of the localized string is checked.
    const firstTime = list.locator('.series-card__game-time').first();
    await expect(firstTime).toHaveText(/\d{1,2}:\d{2}\s?(AM|PM)/i);
  });

  test('the Today/Tomorrow section renders for a bracket with an upcoming game', async ({
    page,
  }) => {
    await stubBracket2026WithGameTimes(page);
    await page.goto('/');
    await switchToEnglish(page);

    const section = page.getByTestId('upcoming-games');
    await expect(section).toBeVisible();
    await expect(
      section.getByRole('heading', { name: /today.*tomorrow/i }),
    ).toBeVisible();

    // The upcoming NLCS game surfaces with its matchup, a local time, and a
    // countdown template.
    await expect(section).toContainText('Los Angeles Dodgers');
    await expect(section.locator('.upcoming__time').first()).toHaveText(
      /\d{1,2}:\d{2}\s?(AM|PM)/i,
    );
    await expect(section.locator('.upcoming__countdown').first()).toHaveText(
      /Starts in \d+d \d+h \d+m/,
    );
  });

  test('an "Add to calendar" affordance appears for a timed game and is absent for the TBD game', async ({
    page,
  }) => {
    await stubBracket2026WithGameTimes(page);
    await page.goto('/');
    await switchToEnglish(page);

    const upcomingCard = page.locator(
      `[data-series-id="${SAMPLE_2026_UPCOMING_SERIES_ID}"]`,
    );
    await expect(upcomingCard).toBeVisible();

    await upcomingCard.locator('.series-card__games-toggle').click();
    const rows = upcomingCard.locator('.series-card__game');
    await expect(rows).toHaveCount(2);

    const timedRow = rows.nth(0);
    const tbdRow = rows.nth(1);

    // The timed game: a local time + an enabled Add-to-calendar control.
    await expect(timedRow.locator('.series-card__game-time')).toHaveText(
      /\d{1,2}:\d{2}\s?(AM|PM)/i,
    );
    const addButton = timedRow.getByRole('button', {
      name: /add .* to your calendar/i,
    });
    await expect(addButton).toBeEnabled();

    // The TBD game: the localized "Time TBD" label and NO calendar control.
    await expect(tbdRow.locator('.series-card__game-time')).toHaveText(
      'Time TBD',
    );
    await expect(tbdRow.getByRole('button')).toHaveCount(0);
  });

  test('triggering the .ics affordance downloads a valid VEVENT', async ({
    page,
  }) => {
    await stubBracket2026WithGameTimes(page);
    await page.goto('/');
    await switchToEnglish(page);

    const upcomingCard = page.locator(
      `[data-series-id="${SAMPLE_2026_UPCOMING_SERIES_ID}"]`,
    );
    await upcomingCard.locator('.series-card__games-toggle').click();
    const addButton = upcomingCard
      .locator('.series-card__game')
      .nth(0)
      .getByRole('button', { name: /add .* to your calendar/i });

    const downloadPromise = page.waitForEvent('download');
    await addButton.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.ics$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks).toString('utf-8');
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('BEGIN:VEVENT');
    expect(body).toMatch(/DTSTART:\d{8}T\d{6}Z/);
    expect(body).toContain('END:VEVENT');
  });
});
