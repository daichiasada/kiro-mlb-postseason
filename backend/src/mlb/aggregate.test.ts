import { describe, expect, it } from 'vitest';
import { aggregateBracket, mapLeague, mapRound } from './aggregate.js';
import type { RawGame } from './client.js';

function game(partial: Partial<RawGame> & {
  gamePk: number;
  seriesDescription: string;
  seriesGameNumber: number;
  awayId: number;
  homeId: number;
  awayWin: boolean;
}): RawGame {
  return {
    gamePk: partial.gamePk,
    gameDate: partial.gameDate ?? '2024-10-01T18:00:00Z',
    seriesDescription: partial.seriesDescription,
    seriesGameNumber: partial.seriesGameNumber,
    gamesInSeries: partial.gamesInSeries ?? 3,
    status: { abstractGameState: 'Final' },
    teams: {
      away: {
        team: { id: partial.awayId, name: `away-${partial.awayId}` },
        score: partial.awayWin ? 3 : 1,
        isWinner: partial.awayWin,
      },
      home: {
        team: { id: partial.homeId, name: `home-${partial.homeId}` },
        score: partial.awayWin ? 1 : 3,
        isWinner: !partial.awayWin,
      },
    },
  };
}

describe('mapRound', () => {
  it('maps each description to its round name', () => {
    expect(mapRound('AL Wild Card Series')).toBe('Wild Card');
    expect(mapRound('NL Division Series')).toBe('Division Series');
    expect(mapRound('AL Championship Series')).toBe('Championship Series');
    expect(mapRound('World Series')).toBe('World Series');
  });
});

describe('mapLeague', () => {
  it('derives league from the description prefix', () => {
    expect(mapLeague('AL Wild Card Series')).toBe('AL');
    expect(mapLeague('NL Division Series')).toBe('NL');
    expect(mapLeague('World Series')).toBe('WS');
  });
});

describe('aggregateBracket', () => {
  it('groups games by series and computes wins, status, round, and league', () => {
    // AL Wild Card: away team 116 sweeps home team 117 in 2 games (best-of-3).
    const games: RawGame[] = [
      game({
        gamePk: 1,
        seriesDescription: 'AL Wild Card Series',
        seriesGameNumber: 1,
        awayId: 116,
        homeId: 117,
        awayWin: true,
      }),
      game({
        gamePk: 2,
        seriesDescription: 'AL Wild Card Series',
        seriesGameNumber: 2,
        awayId: 116,
        homeId: 117,
        awayWin: true,
      }),
    ];

    const bracket = aggregateBracket(games, 2024);
    expect(bracket.season).toBe(2024);
    expect(bracket.series).toHaveLength(1);

    const series = bracket.series[0]!;
    expect(series.round).toBe('Wild Card');
    expect(series.league).toBe('AL');
    expect(series.bestOf).toBe(3);
    // High seed is the home team of game 1 (117); low seed is 116.
    expect(series.high.teamId).toBe(117);
    expect(series.low.teamId).toBe(116);
    expect(series.high.wins).toBe(0);
    expect(series.low.wins).toBe(2);
    expect(series.status).toBe('final');
    expect(series.id).toBe('2024-al-wildcard-117-116');
    expect(series.games).toHaveLength(2);
    expect(series.games[0]!.seriesGameNumber).toBe(1);
  });

  it('marks an unfinished series as in_progress', () => {
    const games: RawGame[] = [
      game({
        gamePk: 10,
        seriesDescription: 'NL Division Series',
        seriesGameNumber: 1,
        awayId: 121,
        homeId: 119,
        awayWin: true,
        gamesInSeries: 5,
      }),
    ];

    const bracket = aggregateBracket(games, 2024);
    const series = bracket.series[0]!;
    expect(series.bestOf).toBe(5);
    expect(series.status).toBe('in_progress');
    expect(series.low.wins).toBe(1); // away team 121 is the low seed
    expect(series.high.wins).toBe(0);
  });

  it('classifies a preview-only series (games present, nothing decided) as scheduled', () => {
    // The real live MLB Stats API lists not-yet-played games as "Preview"
    // entries with null scores and null winners. A series whose only games are
    // previews has decided nothing and must be 'scheduled', NOT a live 0-0
    // 'in_progress' card.
    const games: RawGame[] = [
      {
        gamePk: 30,
        gameDate: '2026-10-01T18:00:00Z',
        seriesDescription: 'AL Wild Card Series',
        seriesGameNumber: 1,
        gamesInSeries: 3,
        status: { abstractGameState: 'Preview' },
        teams: {
          away: { team: { id: 9001, name: 'AL Higher Seed' }, score: null, isWinner: null },
          home: { team: { id: 9002, name: 'AL Lower Seed' }, score: null, isWinner: null },
        },
      },
      {
        gamePk: 31,
        gameDate: '2026-10-02T18:00:00Z',
        seriesDescription: 'AL Wild Card Series',
        seriesGameNumber: 2,
        gamesInSeries: 3,
        status: { abstractGameState: 'Preview' },
        teams: {
          away: { team: { id: 9002, name: 'AL Lower Seed' }, score: null, isWinner: null },
          home: { team: { id: 9001, name: 'AL Higher Seed' }, score: null, isWinner: null },
        },
      },
    ];

    const bracket = aggregateBracket(games, 2026);
    expect(bracket.series).toHaveLength(1);
    const series = bracket.series[0]!;
    expect(series.games).toHaveLength(2); // games ARE present
    expect(series.status).toBe('scheduled'); // but nothing is decided
    expect(series.high.wins).toBe(0);
    expect(series.low.wins).toBe(0);
  });

  it('marks a series with at least one decided game as in_progress', () => {
    // A Final game mixed with a later Preview game: one decision recorded, so
    // the series has genuinely started.
    const games: RawGame[] = [
      {
        gamePk: 40,
        gameDate: '2026-10-01T18:00:00Z',
        seriesDescription: 'AL Wild Card Series',
        seriesGameNumber: 1,
        gamesInSeries: 3,
        status: { abstractGameState: 'Final' },
        teams: {
          away: { team: { id: 116, name: 'Detroit Tigers' }, score: 3, isWinner: true },
          home: { team: { id: 117, name: 'Houston Astros' }, score: 1, isWinner: false },
        },
      },
      {
        gamePk: 41,
        gameDate: '2026-10-02T18:00:00Z',
        seriesDescription: 'AL Wild Card Series',
        seriesGameNumber: 2,
        gamesInSeries: 3,
        status: { abstractGameState: 'Preview' },
        teams: {
          away: { team: { id: 116, name: 'Detroit Tigers' }, score: null, isWinner: null },
          home: { team: { id: 117, name: 'Houston Astros' }, score: null, isWinner: null },
        },
      },
    ];

    const bracket = aggregateBracket(games, 2026);
    const series = bracket.series[0]!;
    expect(series.status).toBe('in_progress');
    expect(series.low.wins).toBe(1); // away team 116 is the low seed
  });

  it('keeps separate series distinct and orders them by round progression', () => {
    const games: RawGame[] = [
      game({
        gamePk: 20,
        seriesDescription: 'World Series',
        seriesGameNumber: 1,
        awayId: 147,
        homeId: 119,
        awayWin: false,
        gamesInSeries: 7,
      }),
      game({
        gamePk: 21,
        seriesDescription: 'AL Wild Card Series',
        seriesGameNumber: 1,
        awayId: 116,
        homeId: 117,
        awayWin: true,
      }),
    ];

    const bracket = aggregateBracket(games, 2024);
    expect(bracket.series).toHaveLength(2);
    // Wild Card should sort before World Series.
    expect(bracket.series[0]!.round).toBe('Wild Card');
    expect(bracket.series[1]!.round).toBe('World Series');
    expect(bracket.series[1]!.league).toBe('WS');
  });
});
