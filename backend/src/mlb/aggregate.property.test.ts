/**
 * Property-based tests for the pure MLB bracket aggregator.
 *
 * These exercise the REAL {@link aggregateBracket} function with randomized but
 * valid raw-game arrays (the shape the MLB Stats API returns) and assert the
 * structural invariants of every produced series:
 *
 *   - high.wins and low.wins never exceed the clinch count ceil(bestOf / 2),
 *     which is the real upper bound on a series (a team stops playing once it
 *     clinches), tighter than the loose `wins <= bestOf` bound.
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
 * Builds a single valid raw game from an explicit winner. The away/home ids are
 * the passed distinct pair so games aggregate into one coherent series; the
 * home team of game 1 becomes the high seed in {@link aggregateBracket}.
 */
function makeGame(
  seriesDescription: string,
  gamesInSeries: number,
  seriesGameNumber: number,
  awayId: number,
  homeId: number,
  gamePk: number,
  awayWin: boolean,
): RawGame {
  return {
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
  };
}

/**
 * The specification of one series: its description and an unordered team pair.
 * {@link aggregateBracket} groups games by `(description + unordered pair)`, so
 * this tuple is exactly a series' grouping key. Generating the whole bracket as
 * a set of specs that are UNIQUE on this key guarantees distinct generated
 * series never collide and get merged (which would sum their wins past the
 * clinch count and break the `wins <= clinch` invariant).
 */
interface SeriesSpec {
  description: string;
  pair: readonly [number, number];
}

/** The grouping key aggregateBracket uses: description + unordered team pair. */
function specKey({ description, pair }: SeriesSpec): string {
  const [a, b] = [...pair].sort((x, y) => x - y);
  return `${description}::${a}-${b}`;
}

/** Arbitrary for a single series spec (description + a distinct team pair). */
function seriesSpecArb(): fc.Arbitrary<SeriesSpec> {
  return fc.record({
    description: fc.constantFrom(...SERIES_DESCRIPTIONS),
    pair: fc
      .uniqueArray(fc.constantFrom(...TEAM_IDS), { minLength: 2, maxLength: 2 })
      .map(([a, b]) => [a!, b!] as const),
  });
}

/**
 * Generates one series worth of games from a fixed spec (its description and
 * team pair are supplied so the caller can guarantee cross-series uniqueness).
 *
 * A real postseason series stops the moment one team reaches the clinch count
 * `ceil(bestOf / 2)`, so no team can ever win MORE than clinch games. To keep
 * the generated data faithful to that contract (and let the test assert the
 * tight `wins <= clinch` bound), win counts are generated directly and capped
 * at clinch: at most one team may reach clinch, and the loser's wins stay in
 * `[0, clinch - 1]`. Games are then emitted with explicit winners.
 */
function seriesGamesArb(spec: SeriesSpec): fc.Arbitrary<RawGame[]> {
  return fc
    .record({
      gamesInSeries: fc.constantFrom(3, 5, 7),
      clinched: fc.boolean(),
      basePk: fc.integer({ min: 1, max: 900_000 }),
    })
    .chain(({ gamesInSeries, clinched, basePk }) => {
      const { description } = spec;
      const [awayId, homeId] = spec.pair;
      const clinch = Math.ceil(gamesInSeries / 2);
      // Away team is the home team of every generated game except game 1, where
      // we keep away/home as the pair so homeId is the game-1 high seed. We cap
      // each team's wins at clinch (winner) / clinch - 1 (loser).
      const winnerWinsArb = clinched
        ? fc.constant(clinch)
        : fc.integer({ min: 0, max: clinch - 1 });
      return fc
        .record({
          awayIsWinner: fc.boolean(),
          winnerWins: winnerWinsArb,
          loserWins: fc.integer({ min: 0, max: clinch - 1 }),
        })
        .map(({ awayIsWinner, winnerWins, loserWins }) => {
          const awayWins = awayIsWinner ? winnerWins : loserWins;
          const homeWins = awayIsWinner ? loserWins : winnerWins;
          const games: RawGame[] = [];
          let gameNumber = 1;
          let pk = basePk;
          for (let i = 0; i < awayWins; i += 1) {
            games.push(
              makeGame(description, gamesInSeries, gameNumber, awayId, homeId, pk, true),
            );
            gameNumber += 1;
            pk += 1;
          }
          for (let i = 0; i < homeWins; i += 1) {
            games.push(
              makeGame(description, gamesInSeries, gameNumber, awayId, homeId, pk, false),
            );
            gameNumber += 1;
            pk += 1;
          }
          return games;
        });
    });
}

describe('aggregateBracket (property-based)', () => {
  it('produces series whose win counts never exceed the clinch count and whose round/league/status are valid', () => {
    fc.assert(
      fc.property(
        // Draw a set of series specs that are UNIQUE on their (description +
        // unordered pair) grouping key, then expand each to its games and flat
        // them. Because no two specs share a key, aggregateBracket can never
        // merge two distinct generated series into one (which would sum wins
        // past the clinch count).
        fc
          .uniqueArray(seriesSpecArb(), {
            minLength: 1,
            maxLength: 4,
            selector: specKey,
          })
          .chain((specs) =>
            fc
              .tuple(...specs.map((spec) => seriesGamesArb(spec)))
              .map((nested) => nested.flat()),
          ),
        (games) => {
          const bracket = aggregateBracket(games, 2024);
          expect(bracket.season).toBe(2024);

          for (const series of bracket.series) {
            // The tight, real contract: a team stops once it clinches, so no
            // team can win more than ceil(bestOf / 2) games.
            const clinch = Math.ceil(series.bestOf / 2);
            expect(series.high.wins).toBeLessThanOrEqual(clinch);
            expect(series.low.wins).toBeLessThanOrEqual(clinch);
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
