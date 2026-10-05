import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { I18nProvider } from '../i18n';
import { UpcomingGames } from './UpcomingGames';
import type { Bracket } from '@mlb/shared';

/**
 * A fixed instant and zone so the today/tomorrow bucketing and the countdown
 * are deterministic regardless of the host clock/zone. `now` is Oct 20 2026
 * 12:00 UTC; in UTC the two timed games below fall on "today" (Oct 20) and
 * "tomorrow" (Oct 21).
 */
const NOW = new Date('2026-10-20T12:00:00.000Z');
const TZ = 'UTC';

/**
 * A bracket with one timed game today, one timed game tomorrow, one time-TBD
 * game, and one finished (past) game. Only the two future timed games should
 * surface in the upcoming section.
 */
const bracket: Bracket = {
  season: 2026,
  updatedAt: '2026-10-20T00:00:00.000Z',
  series: [
    {
      id: '2026-ws-worldseries-119-147',
      round: 'World Series',
      league: 'WS',
      high: { teamId: 119, wins: 1 },
      low: { teamId: 147, wins: 1 },
      bestOf: 7,
      status: 'in_progress',
      games: [
        {
          gamePk: 900001,
          date: '2026-10-20',
          startTime: '2026-10-20T23:08:00.000Z',
          away: { teamId: 147, score: null, isWinner: null },
          home: { teamId: 119, score: null, isWinner: null },
          seriesGameNumber: 3,
        },
        {
          gamePk: 900002,
          date: '2026-10-21',
          startTime: '2026-10-21T23:08:00.000Z',
          away: { teamId: 147, score: null, isWinner: null },
          home: { teamId: 119, score: null, isWinner: null },
          seriesGameNumber: 4,
        },
        {
          gamePk: 900003,
          date: '2026-10-22',
          timeTbd: true,
          away: { teamId: 147, score: null, isWinner: null },
          home: { teamId: 119, score: null, isWinner: null },
          seriesGameNumber: 5,
        },
      ],
    },
  ],
};

/** A results-only bracket whose games are all finished (none upcoming). */
const resultsOnlyBracket: Bracket = {
  season: 2024,
  updatedAt: '2024-10-31T00:00:00.000Z',
  series: [
    {
      id: '2024-ws-worldseries-119-147',
      round: 'World Series',
      league: 'WS',
      high: { teamId: 119, wins: 4 },
      low: { teamId: 147, wins: 1 },
      bestOf: 7,
      status: 'final',
      games: [
        {
          gamePk: 700001,
          date: '2024-10-25',
          startTime: '2024-10-25T23:08:00.000Z',
          away: { teamId: 147, score: 2, isWinner: false },
          home: { teamId: 119, score: 6, isWinner: true },
          seriesGameNumber: 1,
        },
      ],
    },
  ],
};

function renderUpcoming(b: Bracket) {
  return render(
    <I18nProvider initialLang="en">
      <UpcomingGames bracket={b} now={NOW} timeZone={TZ} />
    </I18nProvider>,
  );
}

describe('UpcomingGames', () => {
  it('lists only the upcoming timed games with a localized time and countdown', () => {
    renderUpcoming(bracket);

    const section = screen.getByTestId('upcoming-games');
    const items = within(section).getAllByRole('listitem');
    // Only the two future timed games (the TBD game is skipped upstream).
    expect(items).toHaveLength(2);

    // Today bucket for the Oct 20 game, Tomorrow for the Oct 21 game.
    expect(within(section).getByText('Today')).toBeInTheDocument();
    expect(within(section).getByText('Tomorrow')).toBeInTheDocument();

    // The localized local start time is rendered via <time dateTime=...>.
    const times = section.querySelectorAll('time.upcoming__time');
    expect(times).toHaveLength(2);
    // en-US formatting with a 12-hour clock yields an AM/PM time-ish string.
    expect(times[0].textContent).toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/i);

    // A countdown is shown for each upcoming game.
    expect(within(section).getAllByText(/Starts in \d+d \d+h \d+m/).length).toBe(
      2,
    );
  });

  it('renders nothing when there are no upcoming games (results-only)', () => {
    const { container } = renderUpcoming(resultsOnlyBracket);
    expect(screen.queryByTestId('upcoming-games')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a bracket whose only remaining game is time-TBD', () => {
    const allTbd: Bracket = {
      ...bracket,
      series: [
        {
          ...bracket.series[0],
          games: [bracket.series[0].games[2]], // the single TBD game
        },
      ],
    };
    renderUpcoming(allTbd);
    expect(screen.queryByTestId('upcoming-games')).not.toBeInTheDocument();
  });
});
