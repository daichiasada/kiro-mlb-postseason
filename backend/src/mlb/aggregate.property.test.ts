/**
 * Property-based tests for the pure MLB bracket aggregator.
 *
 * These exercise the REAL {@link aggregateBracket} function with randomized but
 * valid raw-game arrays (the shape the MLB Stats API returns) and assert the
 * structural invariants of every produced series:
 *
 *   - high.wins and low.wins never exceed bestOf.
 *   - status is one of 'scheduled' | 'in_progress' | 'final'.
 *   - league is one of 'AL' | 'NL' | 'WS'.
 *   - round is one of the four canonical RoundName values.
 *
 * fast-check (fc.assert / fc.property) drives many cases per invariant, which
 * is the IDE-only property-based-testing Kiro University lesson.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { RoundName, SeriesLeague, SeriesStatus } from '@mlb/shared';
import { aggregateBracket } from './aggregate.js';
import type { RawGame } from './client.js';

const TEAM_IDS = [110, 114, 116, 117, 118, 119, 121, 135, 143, 144, 147, 158];

/** Raw series descriptions covering every round and both leagues. */
const SERIES_DESCRIPTIONS = [
  'AL Wild Card Series',
  'NL Wild Card Series',
  'AL Division Series',
  'NL Division Series',
  'AL Championship Series',
  'NL Championship Series',
  'World Series',
];

const VALID_ROUNDS: RoundName[] = [
  'Wild Card',
  'Division Series',
  'Championship Series',
  'World Series',
];
const VALID_LEAGUES: SeriesLeague[] = ['AL', 'NL', 'WS'];
const VALID_STATUSES: SeriesStatus[] = ['scheduled', 'in_progress', 'final'];

/**
 * Generates a single valid raw game. The away/home ids are drawn from a passed
 * distinct pair so games aggregate into coherent two-team series.
 */
function gameArb(
  seriesDescription: string,
  gamesInSeries: number,
  awayId: number,
  homeId: number,
): fc.Arbitrary<RawGame> {
  return fc
    .record({
      gamePk: fc.integer({ min: 1, max: 1_000_000 }),
      seriesGameNumber: fc.integer({ min: 1, max: gamesInSeries }),
      awayWin: fc.boolean(),
    })
    .map(({ gamePk, seriesGameNumber, awayWin }) => ({
      gamePk,
      gameDate: '2024-10-05T18:00:00Z',
      seriesDescription,
      seriesGameNumber,
      gamesInSeries,
      status: { abstractGameState: 'Final' },
      teams: {
        away: {
          team: { id: awayId, name: `away-${awayId}` },
          score: awayWin ? 4 : 2,
          isWinner: awayWin,
        },
        home: {
          team: { id: homeId, name: `home-${homeId}` },
          score: awayWin ? 2 : 4,
          isWinner: !awayWin,
        },
      },
    }));
}

/** Generates one series worth of games (a distinct team pair + description). */
function seriesGamesArb(): fc.Arbitrary<RawGame[]> {
  return fc
    .record({
      description: fc.constantFrom(...SERIES_DESCRIPTIONS),
      gamesInSeries: fc.constantFrom(3, 5, 7),
      pair: fc
        .uniqueArray(fc.constantFrom(...TEAM_IDS), { minLength: 2, maxLength: 2 })
        .map(([a, b]) => [a!, b!] as const),
    })
    .chain(({ description, gamesInSeries, pair }) => {
      const [awayId, homeId] = pair;
      // A real series never plays more games than its best-of length, so the
      // generated game count is bounded by gamesInSeries. This keeps the data
      // realistic and lets the aggregator's win counts stay within bestOf.
      return fc.integer({ min: 0, max: gamesInSeries }).chain((count) => {
        if (count === 0) {
          return fc.constant<RawGame[]>([]);
        }
        return fc.array(gameArb(description, gamesInSeries, awayId, homeId), {
          minLength: count,
          maxLength: count,
        });
      });
    });
}

describe('aggregateBracket (property-based)', () => {
  it('produces series whose win counts never exceed bestOf and whose round/league/status are valid', () => {
    fc.assert(
      fc.property(
        fc.array(seriesGamesArb(), { minLength: 1, maxLength: 4 }).map((nested) =>
          nested.flat(),
        ),
        (games) => {
          const bracket = aggregateBracket(games, 2024);
          expect(bracket.season).toBe(2024);

          for (const series of bracket.series) {
            expect(series.high.wins).toBeLessThanOrEqual(series.bestOf);
            expect(series.low.wins).toBeLessThanOrEqual(series.bestOf);
            expect(series.high.wins).toBeGreaterThanOrEqual(0);
            expect(series.low.wins).toBeGreaterThanOrEqual(0);
            expect(VALID_STATUSES).toContain(series.status);
            expect(VALID_LEAGUES).toContain(series.league);
            expect(VALID_ROUNDS).toContain(series.round);
          }
        },
      ),
    );
  });

  it('always returns a bracket for an empty game list with no series', () => {
    const bracket = aggregateBracket([], 2024);
    expect(bracket.series).toHaveLength(0);
    expect(bracket.season).toBe(2024);
  });
});
