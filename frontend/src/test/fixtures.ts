import type { Bracket, Series } from '@mlb/shared';

/** A finished AL Wild Card series: Tigers (116) beat Astros (117) 2-0. */
export const wildCardSeries: Series = {
  id: '2024-al-wildcard-117-116',
  round: 'Wild Card',
  league: 'AL',
  high: { teamId: 117, wins: 0 },
  low: { teamId: 116, wins: 2 },
  bestOf: 3,
  status: 'final',
  games: [
    {
      gamePk: 775345,
      date: '2024-10-01',
      away: { teamId: 116, score: 3, isWinner: true },
      home: { teamId: 117, score: 1, isWinner: false },
      seriesGameNumber: 1,
    },
    {
      gamePk: 775344,
      date: '2024-10-02',
      away: { teamId: 116, score: 5, isWinner: true },
      home: { teamId: 117, score: 2, isWinner: false },
      seriesGameNumber: 2,
    },
  ],
};

/** World Series: Dodgers (119) beat Yankees (147) 4-1. */
export const worldSeries: Series = {
  id: '2024-ws-worldseries-119-147',
  round: 'World Series',
  league: 'WS',
  high: { teamId: 119, wins: 4 },
  low: { teamId: 147, wins: 1 },
  bestOf: 7,
  status: 'final',
  games: [],
};

export const sampleBracket: Bracket = {
  season: 2024,
  updatedAt: '2024-10-31T00:00:00.000Z',
  series: [wildCardSeries, worldSeries],
};
