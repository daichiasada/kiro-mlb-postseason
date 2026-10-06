import { describe, expect, it } from 'vitest';
import type { Bracket, Series } from '@mlb/shared';
import { cumulativeWinTrend, seriesScoreDiffs, winProbTrend } from './seriesCharts';

/** An empty bracket is enough: predict() reserves the bracket for future use. */
const bracket: Bracket = { season: 2026, updatedAt: '2026-01-01T00:00:00.000Z', series: [] };

/**
 * SWEEP: a lopsided best-of-5 where the low seed (Dodgers 119) sweeps the high
 * seed (Yankees 147) 3-0 with large margins. Note `high`/`low` win counts are
 * deliberately stored "wrong-looking" (we recompute from `isWinner`).
 */
const sweepSeries: Series = {
  id: 'sweep',
  round: 'Division Series',
  league: 'AL',
  high: { teamId: 147, wins: 0 },
  low: { teamId: 119, wins: 3 },
  bestOf: 5,
  status: 'final',
  games: [
    {
      gamePk: 1,
      date: '2026-10-01',
      away: { teamId: 119, score: 10, isWinner: true },
      home: { teamId: 147, score: 1, isWinner: false },
      seriesGameNumber: 1,
    },
    {
      gamePk: 2,
      date: '2026-10-02',
      away: { teamId: 119, score: 8, isWinner: true },
      home: { teamId: 147, score: 0, isWinner: false },
      seriesGameNumber: 2,
    },
    {
      gamePk: 3,
      date: '2026-10-04',
      away: { teamId: 147, score: 2, isWinner: false },
      home: { teamId: 119, score: 9, isWinner: true },
      seriesGameNumber: 3,
    },
  ],
};

/**
 * CLOSE: a best-of-7 that goes the full distance in one-run games, with the
 * high seed (Dodgers 119) winning 4-3. Games are intentionally out of order in
 * the array to exercise the sort.
 */
const closeSeries: Series = {
  id: 'close',
  round: 'World Series',
  league: 'WS',
  high: { teamId: 119, wins: 4 },
  low: { teamId: 147, wins: 3 },
  bestOf: 7,
  status: 'final',
  games: [
    {
      gamePk: 2,
      date: '2026-10-21',
      away: { teamId: 147, score: 4, isWinner: true },
      home: { teamId: 119, score: 3, isWinner: false },
      seriesGameNumber: 2,
    },
    {
      gamePk: 1,
      date: '2026-10-20',
      away: { teamId: 147, score: 2, isWinner: false },
      home: { teamId: 119, score: 3, isWinner: true },
      seriesGameNumber: 1,
    },
    {
      gamePk: 3,
      date: '2026-10-23',
      away: { teamId: 119, score: 1, isWinner: false },
      home: { teamId: 147, score: 2, isWinner: true },
      seriesGameNumber: 3,
    },
    {
      gamePk: 4,
      date: '2026-10-24',
      away: { teamId: 119, score: 5, isWinner: true },
      home: { teamId: 147, score: 4, isWinner: false },
      seriesGameNumber: 4,
    },
    {
      gamePk: 5,
      date: '2026-10-25',
      away: { teamId: 119, score: 2, isWinner: false },
      home: { teamId: 147, score: 3, isWinner: true },
      seriesGameNumber: 5,
    },
    {
      gamePk: 6,
      date: '2026-10-27',
      away: { teamId: 147, score: 1, isWinner: false },
      home: { teamId: 119, score: 2, isWinner: true },
      seriesGameNumber: 6,
    },
    {
      gamePk: 7,
      date: '2026-10-28',
      away: { teamId: 147, score: 3, isWinner: false },
      home: { teamId: 119, score: 4, isWinner: true },
      seriesGameNumber: 7,
    },
  ],
};

/**
 * IN-PROGRESS / null-score edge case: game 1 is final (Mets 121 beat Brewers
 * 158), game 2 is in progress with null scores and null `isWinner`.
 */
const inProgressSeries: Series = {
  id: 'inprog',
  round: 'Championship Series',
  league: 'NL',
  high: { teamId: 121, wins: 1 },
  low: { teamId: 158, wins: 0 },
  bestOf: 7,
  status: 'in_progress',
  games: [
    {
      gamePk: 1,
      date: '2026-10-10',
      away: { teamId: 158, score: 2, isWinner: false },
      home: { teamId: 121, score: 6, isWinner: true },
      seriesGameNumber: 1,
    },
    {
      gamePk: 2,
      date: '2026-10-11',
      away: { teamId: 158, score: null, isWinner: null },
      home: { teamId: 121, score: null, isWinner: null },
      seriesGameNumber: 2,
    },
  ],
};

const emptySeries: Series = {
  id: 'empty',
  round: 'Wild Card',
  league: 'AL',
  high: { teamId: 117, wins: 0 },
  low: { teamId: 116, wins: 0 },
  bestOf: 3,
  status: 'scheduled',
  games: [],
};

describe('seriesScoreDiffs', () => {
  it('pins the lopsided sweep margins and winners', () => {
    expect(seriesScoreDiffs(sweepSeries)).toEqual([
      {
        gameNumber: 1,
        awayTeamId: 119,
        homeTeamId: 147,
        awayScore: 10,
        homeScore: 1,
        winnerTeamId: 119,
        diff: 9,
      },
      {
        gameNumber: 2,
        awayTeamId: 119,
        homeTeamId: 147,
        awayScore: 8,
        homeScore: 0,
        winnerTeamId: 119,
        diff: 8,
      },
      {
        gameNumber: 3,
        awayTeamId: 147,
        homeTeamId: 119,
        awayScore: 2,
        homeScore: 9,
        winnerTeamId: 119,
        diff: 7,
      },
    ]);
  });

  it('pins the close series margins (all 1) in sorted order', () => {
    const diffs = seriesScoreDiffs(closeSeries);
    expect(diffs.map((d) => d.gameNumber)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(diffs.map((d) => d.diff)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(diffs.map((d) => d.winnerTeamId)).toEqual([119, 147, 147, 119, 147, 119, 119]);
  });

  it('handles a null-score in-progress game: diff 0, winnerTeamId null', () => {
    expect(seriesScoreDiffs(inProgressSeries)).toEqual([
      {
        gameNumber: 1,
        awayTeamId: 158,
        homeTeamId: 121,
        awayScore: 2,
        homeScore: 6,
        winnerTeamId: 121,
        diff: 4,
      },
      {
        gameNumber: 2,
        awayTeamId: 158,
        homeTeamId: 121,
        awayScore: null,
        homeScore: null,
        winnerTeamId: null,
        diff: 0,
      },
    ]);
  });

  it('returns [] for a games-less series', () => {
    expect(seriesScoreDiffs(emptySeries)).toEqual([]);
  });
});

describe('cumulativeWinTrend', () => {
  it('pins the sweep running totals (low seed 119 to 3-0)', () => {
    expect(cumulativeWinTrend(sweepSeries)).toEqual([
      { gameNumber: 1, highWins: 0, lowWins: 1 },
      { gameNumber: 2, highWins: 0, lowWins: 2 },
      { gameNumber: 3, highWins: 0, lowWins: 3 },
    ]);
  });

  it('pins the close series running totals (ends 4-3 to the high seed)', () => {
    expect(cumulativeWinTrend(closeSeries)).toEqual([
      { gameNumber: 1, highWins: 1, lowWins: 0 },
      { gameNumber: 2, highWins: 1, lowWins: 1 },
      { gameNumber: 3, highWins: 1, lowWins: 2 },
      { gameNumber: 4, highWins: 2, lowWins: 2 },
      { gameNumber: 5, highWins: 2, lowWins: 3 },
      { gameNumber: 6, highWins: 3, lowWins: 3 },
      { gameNumber: 7, highWins: 4, lowWins: 3 },
    ]);
  });

  it('does not count a null-score in-progress game as a win', () => {
    expect(cumulativeWinTrend(inProgressSeries)).toEqual([
      { gameNumber: 1, highWins: 1, lowWins: 0 },
      { gameNumber: 2, highWins: 1, lowWins: 0 },
    ]);
  });

  it('returns [] for a games-less series', () => {
    expect(cumulativeWinTrend(emptySeries)).toEqual([]);
  });
});

describe('winProbTrend', () => {
  it('pins the sweep favorite win probabilities at accuracy 0.5', () => {
    expect(winProbTrend(sweepSeries, bracket, 0.5)).toEqual([
      { gameNumber: 1, favoriteTeamId: 119, favoriteWinProbability: 0.6928 },
      { gameNumber: 2, favoriteTeamId: 119, favoriteWinProbability: 0.7839 },
      { gameNumber: 3, favoriteTeamId: 119, favoriteWinProbability: 0.8333 },
    ]);
  });

  it('pins the close series favorite win probabilities at accuracy 0.5', () => {
    expect(winProbTrend(closeSeries, bracket, 0.5)).toEqual([
      { gameNumber: 1, favoriteTeamId: 119, favoriteWinProbability: 0.697 },
      { gameNumber: 2, favoriteTeamId: 119, favoriteWinProbability: 0.5149 },
      { gameNumber: 3, favoriteTeamId: 147, favoriteWinProbability: 0.5917 },
      { gameNumber: 4, favoriteTeamId: 119, favoriteWinProbability: 0.5098 },
      { gameNumber: 5, favoriteTeamId: 147, favoriteWinProbability: 0.5649 },
      { gameNumber: 6, favoriteTeamId: 119, favoriteWinProbability: 0.5073 },
      { gameNumber: 7, favoriteTeamId: 119, favoriteWinProbability: 0.5631 },
    ]);
  });

  it('pins the in-progress / null-score trend (game 2 reuses game 1 win counts)', () => {
    expect(winProbTrend(inProgressSeries, bracket, 0.5)).toEqual([
      { gameNumber: 1, favoriteTeamId: 121, favoriteWinProbability: 0.697 },
      { gameNumber: 2, favoriteTeamId: 121, favoriteWinProbability: 0.697 },
    ]);
  });

  it('returns [] for a games-less series', () => {
    expect(winProbTrend(emptySeries, bracket, 0.5)).toEqual([]);
  });
});
