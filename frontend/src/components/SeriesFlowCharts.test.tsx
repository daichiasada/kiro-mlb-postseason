import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SeriesFlowCharts } from './SeriesFlowCharts';
import { I18nProvider } from '../i18n';
import {
  sampleBracket,
  wildCardSeries,
  predictableBracket,
  predictableInProgressSeries,
} from '../test/fixtures';
import {
  seriesScoreDiffs,
  cumulativeWinTrend,
  winProbTrend,
} from '../seriesCharts';
import type { Bracket, Series } from '@mlb/shared';

function renderCharts(
  series: Series,
  bracket: Bracket,
  season: number,
  predictable: boolean,
) {
  return render(
    <I18nProvider initialLang="en">
      <SeriesFlowCharts
        series={series}
        bracket={bracket}
        season={season}
        predictable={predictable}
      />
    </I18nProvider>,
  );
}

describe('SeriesFlowCharts', () => {
  it('renders the two base charts as SVGs with accessible names (results-only season)', () => {
    renderCharts(wildCardSeries, sampleBracket, 2024, false);

    const diff = screen.getByRole('img', { name: 'Run differential by game' });
    expect(diff.tagName.toLowerCase()).toBe('svg');

    const trend = screen.getByRole('img', { name: 'Cumulative series wins' });
    expect(trend.tagName.toLowerCase()).toBe('svg');
  });

  it('does NOT render the probability chart for a results-only season', () => {
    renderCharts(wildCardSeries, sampleBracket, 2024, false);
    expect(
      screen.queryByRole('img', { name: 'Predicted win probability by game' }),
    ).not.toBeInTheDocument();
    // No probability column header either.
    expect(screen.queryByText('Favorite win probability')).not.toBeInTheDocument();
  });

  it('score-diff table values match the seriesScoreDiffs helper exactly', () => {
    renderCharts(wildCardSeries, sampleBracket, 2024, false);

    const rows = seriesScoreDiffs(wildCardSeries);
    // Fixture: G1 DET 3 @ HOU 1 (diff 2, DET won); G2 DET 5 @ HOU 2 (diff 3, DET won).
    expect(rows).toEqual([
      {
        gameNumber: 1,
        awayTeamId: 116,
        homeTeamId: 117,
        awayScore: 3,
        homeScore: 1,
        winnerTeamId: 116,
        diff: 2,
      },
      {
        gameNumber: 2,
        awayTeamId: 116,
        homeTeamId: 117,
        awayScore: 5,
        homeScore: 2,
        winnerTeamId: 116,
        diff: 3,
      },
    ]);

    const diffTable = screen
      .getByText('Run differential and winner for each game.')
      .closest('table')!;
    const bodyRows = within(diffTable)
      .getAllByRole('row', { hidden: true })
      .slice(1); // drop header
    expect(bodyRows).toHaveLength(2);

    const r1 = within(bodyRows[0])
      .getAllByRole('cell', { hidden: true })
      .map((c) => c.textContent);
    // [away, home, diff, winner]
    expect(r1).toEqual(['DET 3', 'HOU 1', '2', 'DET won']);

    const r2 = within(bodyRows[1])
      .getAllByRole('cell', { hidden: true })
      .map((c) => c.textContent);
    expect(r2).toEqual(['DET 5', 'HOU 2', '3', 'DET won']);
  });

  it('cumulative-trend table values match the cumulativeWinTrend helper exactly', () => {
    renderCharts(wildCardSeries, sampleBracket, 2024, false);

    const trend = cumulativeWinTrend(wildCardSeries);
    // high = Astros (117, 0 wins), low = Tigers (116, both games).
    expect(trend).toEqual([
      { gameNumber: 1, highWins: 0, lowWins: 1 },
      { gameNumber: 2, highWins: 0, lowWins: 2 },
    ]);

    const trendTable = screen
      .getByText('Cumulative series wins for each team after every game.')
      .closest('table')!;
    const bodyRows = within(trendTable)
      .getAllByRole('row', { hidden: true })
      .slice(1);
    const r1 = within(bodyRows[0])
      .getAllByRole('cell', { hidden: true })
      .map((c) => c.textContent);
    expect(r1).toEqual(['0', '1']); // HOU wins, DET wins
    const r2 = within(bodyRows[1])
      .getAllByRole('cell', { hidden: true })
      .map((c) => c.textContent);
    expect(r2).toEqual(['0', '2']);
  });

  it('renders the probability chart + column for a predictable in-progress season', () => {
    renderCharts(
      predictableInProgressSeries,
      predictableBracket,
      2026,
      true,
    );

    const probSvg = screen.getByRole('img', {
      name: 'Predicted win probability by game',
    });
    expect(probSvg.tagName.toLowerCase()).toBe('svg');

    const points = winProbTrend(
      predictableInProgressSeries,
      predictableBracket,
      0.5,
    );
    // Pinned helper output at accuracy 0.5.
    expect(points).toEqual([
      { gameNumber: 1, favoriteTeamId: 121, favoriteWinProbability: 0.697 },
      { gameNumber: 2, favoriteTeamId: 121, favoriteWinProbability: 0.5149 },
      { gameNumber: 3, favoriteTeamId: 121, favoriteWinProbability: 0.6154 },
    ]);

    const probTable = screen
      .getByText('Predicted favorite and win probability after every game.')
      .closest('table')!;
    const bodyRows = within(probTable)
      .getAllByRole('row', { hidden: true })
      .slice(1);
    expect(bodyRows).toHaveLength(3);

    const r1 = within(bodyRows[0])
      .getAllByRole('cell', { hidden: true })
      .map((c) => c.textContent);
    // [favorite, probability]
    expect(r1).toEqual(['NYM', '70%']);
    const r2 = within(bodyRows[1])
      .getAllByRole('cell', { hidden: true })
      .map((c) => c.textContent);
    expect(r2).toEqual(['NYM', '51%']);
    const r3 = within(bodyRows[2])
      .getAllByRole('cell', { hidden: true })
      .map((c) => c.textContent);
    expect(r3).toEqual(['NYM', '62%']);
  });

  it('renders nothing for a series with no games', () => {
    const empty: Series = { ...wildCardSeries, games: [] };
    const { container } = renderCharts(empty, sampleBracket, 2024, false);
    expect(container).toBeEmptyDOMElement();
  });
});
