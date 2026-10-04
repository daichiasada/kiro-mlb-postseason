import { describe, expect, it } from 'vitest';
import { findIntegrityWarnings, type IntegrityWarning } from './integrity.js';
import type { Bracket, GameResult, Series } from './types.js';

// Real team ids (present in TEAMS) and a placeholder id (absent from TEAMS).
const REAL_HIGH = 119; // Los Angeles Dodgers
const REAL_LOW = 147; // New York Yankees
const PLACEHOLDER = 9001; // not a key in TEAMS -> 'AL Higher Seed'-style stub
const PLACEHOLDER_2 = 9002;

function game(partial: Partial<GameResult> & { gamePk: number }): GameResult {
  return {
    gamePk: partial.gamePk,
    date: '2026-10-05T18:00:00Z',
    seriesGameNumber: partial.seriesGameNumber ?? 1,
    away: partial.away ?? { teamId: REAL_LOW, score: 2, isWinner: false },
    home: partial.home ?? { teamId: REAL_HIGH, score: 4, isWinner: true },
  };
}

function series(partial: Partial<Series> & { id: string }): Series {
  return {
    id: partial.id,
    round: partial.round ?? 'World Series',
    league: partial.league ?? 'WS',
    high: partial.high ?? { teamId: REAL_HIGH, wins: 0 },
    low: partial.low ?? { teamId: REAL_LOW, wins: 0 },
    bestOf: partial.bestOf ?? 7,
    status: partial.status ?? 'scheduled',
    games: partial.games ?? [],
  };
}

function bracket(seriesList: Series[]): Bracket {
  return { season: 2026, updatedAt: '2026-10-05T18:00:00Z', series: seriesList };
}

describe('findIntegrityWarnings', () => {
  it('flags a final series that references a placeholder team', () => {
    const result = findIntegrityWarnings(
      bracket([
        series({
          id: '2026-ws-worldseries-9001-147',
          status: 'final',
          high: { teamId: PLACEHOLDER, wins: 4 },
          low: { teamId: REAL_LOW, wins: 2 },
        }),
      ]),
    );

    expect(result).toHaveLength(1);
    const warning = result[0] as IntegrityWarning;
    expect(warning.code).toBe('finished_game_tbd_team');
    expect(warning.scope).toBe('series');
    expect(warning.teamId).toBe(PLACEHOLDER);
    expect(warning.seriesId).toBe('2026-ws-worldseries-9001-147');
    expect(warning.gamePk).toBeUndefined();
  });

  it('flags a decided game that references a placeholder team', () => {
    const result = findIntegrityWarnings(
      bracket([
        series({
          id: '2026-al-wildcard-147-9001',
          round: 'Wild Card',
          league: 'AL',
          status: 'in_progress',
          high: { teamId: REAL_LOW, wins: 1 },
          low: { teamId: PLACEHOLDER, wins: 0 },
          games: [
            game({
              gamePk: 777001,
              away: { teamId: PLACEHOLDER, score: 1, isWinner: false },
              home: { teamId: REAL_LOW, score: 5, isWinner: true },
            }),
          ],
        }),
      ]),
    );

    expect(result).toHaveLength(1);
    const warning = result[0] as IntegrityWarning;
    expect(warning.scope).toBe('game');
    expect(warning.teamId).toBe(PLACEHOLDER);
    expect(warning.gamePk).toBe(777001);
  });

  it('does NOT flag a scheduled series with placeholder teams (not-yet-determined bracket)', () => {
    const result = findIntegrityWarnings(
      bracket([
        series({
          id: '2026-ws-worldseries-9001-9002',
          status: 'scheduled',
          high: { teamId: PLACEHOLDER, wins: 0 },
          low: { teamId: PLACEHOLDER_2, wins: 0 },
          games: [
            // Preview-only game: no decided winner, so not flagged.
            game({
              gamePk: 777100,
              away: { teamId: PLACEHOLDER_2, score: null, isWinner: null },
              home: { teamId: PLACEHOLDER, score: null, isWinner: null },
            }),
          ],
        }),
      ]),
    );

    expect(result).toEqual([]);
  });

  it('yields [] for an all-real-teams final bracket', () => {
    const result = findIntegrityWarnings(
      bracket([
        series({
          id: '2026-ws-worldseries-119-147',
          status: 'final',
          high: { teamId: REAL_HIGH, wins: 4 },
          low: { teamId: REAL_LOW, wins: 1 },
          games: [
            game({
              gamePk: 777200,
              away: { teamId: REAL_LOW, score: 2, isWinner: false },
              home: { teamId: REAL_HIGH, score: 6, isWinner: true },
            }),
          ],
        }),
      ]),
    );

    expect(result).toEqual([]);
  });

  it('yields [] for an empty bracket', () => {
    expect(findIntegrityWarnings(bracket([]))).toEqual([]);
  });

  it('de-duplicates and orders warnings deterministically by round then seriesId', () => {
    const result = findIntegrityWarnings(
      bracket([
        series({
          id: '2026-ws-worldseries-9001-147',
          round: 'World Series',
          league: 'WS',
          status: 'final',
          high: { teamId: PLACEHOLDER, wins: 4 },
          low: { teamId: REAL_LOW, wins: 2 },
        }),
        series({
          id: '2026-al-wildcard-9001-147',
          round: 'Wild Card',
          league: 'AL',
          status: 'final',
          high: { teamId: PLACEHOLDER, wins: 2 },
          low: { teamId: REAL_LOW, wins: 1 },
          // Same placeholder appears in a decided game too; de-dup keeps the
          // series-scope and the distinct game-scope entries.
          games: [
            game({
              gamePk: 777300,
              away: { teamId: PLACEHOLDER, score: 1, isWinner: false },
              home: { teamId: REAL_LOW, score: 5, isWinner: true },
            }),
            game({
              gamePk: 777300,
              away: { teamId: PLACEHOLDER, score: 1, isWinner: false },
              home: { teamId: REAL_LOW, score: 5, isWinner: true },
            }),
          ],
        }),
      ]),
    );

    // Wild Card (round 0) comes before World Series (round 3).
    expect(result.map((w) => w.round)).toEqual([
      'Wild Card',
      'Wild Card',
      'World Series',
    ]);
    // Within the Wild Card series, series scope precedes game scope.
    expect(result[0]?.scope).toBe('series');
    expect(result[1]?.scope).toBe('game');
    // The duplicated game entry collapsed to one.
    expect(result.filter((w) => w.scope === 'game')).toHaveLength(1);
  });
});
