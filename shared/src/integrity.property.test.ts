/**
 * Property-based tests for {@link findIntegrityWarnings}.
 *
 * These exercise the REAL function with randomized but structurally valid
 * {@link Bracket} inputs (mixing real-team ids from {@link TEAMS} with
 * placeholder/TBD ids absent from it, across every status and round) and assert
 * the invariants that define a correct integrity scan:
 *
 *   - Every returned warning references a teamId that is NOT in TEAMS.
 *   - A `scope: 'series'` warning only ever comes from a `status: 'final'`
 *     series, and its teamId is one of that series' two seed team ids.
 *   - A `scope: 'game'` warning only ever comes from a decided game (a game
 *     with a true isWinner), and its teamId is one of that game's two team ids.
 *   - The function never throws on arbitrary valid brackets, and its output is
 *     de-duplicated.
 *
 * Property-based testing (fc.assert / fc.property) is the IDE-only Kiro
 * University lesson; the generators drive hundreds of cases per invariant.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { findIntegrityWarnings } from './integrity.js';
import {
  TEAMS,
  type Bracket,
  type GameResult,
  type RoundName,
  type Series,
  type SeriesLeague,
  type SeriesStatus,
} from './types.js';

const REAL_TEAM_IDS = Object.keys(TEAMS).map(Number);
/** Placeholder ids: integers chosen well outside the real-team id space. */
const PLACEHOLDER_IDS = [9001, 9002, 9003, 9004];

const ROUNDS: RoundName[] = [
  'Wild Card',
  'Division Series',
  'Championship Series',
  'World Series',
];
const LEAGUES: SeriesLeague[] = ['AL', 'NL', 'WS'];
const STATUSES: SeriesStatus[] = ['scheduled', 'in_progress', 'final'];

/** A team id arbitrary that mixes real and placeholder ids. */
function teamIdArb(): fc.Arbitrary<number> {
  return fc.constantFrom(...REAL_TEAM_IDS, ...PLACEHOLDER_IDS);
}

function gameArb(): fc.Arbitrary<GameResult> {
  return fc
    .record({
      gamePk: fc.integer({ min: 1, max: 1_000_000 }),
      seriesGameNumber: fc.integer({ min: 1, max: 7 }),
      awayId: teamIdArb(),
      homeId: teamIdArb(),
      // winner: 0 = away wins, 1 = home wins, 2 = undecided (preview).
      winner: fc.constantFrom(0, 1, 2),
    })
    .map(({ gamePk, seriesGameNumber, awayId, homeId, winner }) => ({
      gamePk,
      date: '2026-10-05T18:00:00Z',
      seriesGameNumber,
      away: {
        teamId: awayId,
        score: winner === 2 ? null : winner === 0 ? 4 : 2,
        isWinner: winner === 2 ? null : winner === 0,
      },
      home: {
        teamId: homeId,
        score: winner === 2 ? null : winner === 1 ? 4 : 2,
        isWinner: winner === 2 ? null : winner === 1,
      },
    }));
}

function seriesArb(): fc.Arbitrary<Series> {
  return fc
    .record({
      idSuffix: fc.integer({ min: 0, max: 100_000 }),
      round: fc.constantFrom(...ROUNDS),
      league: fc.constantFrom(...LEAGUES),
      highId: teamIdArb(),
      lowId: teamIdArb(),
      bestOf: fc.constantFrom(3, 5, 7),
      status: fc.constantFrom(...STATUSES),
      games: fc.array(gameArb(), { maxLength: 5 }),
    })
    .map((r) => ({
      id: `2026-series-${r.idSuffix}`,
      round: r.round,
      league: r.league,
      high: { teamId: r.highId, wins: 0 },
      low: { teamId: r.lowId, wins: 0 },
      bestOf: r.bestOf,
      status: r.status,
      games: r.games,
    }));
}

function bracketArb(): fc.Arbitrary<Bracket> {
  return fc
    .record({
      series: fc.array(seriesArb(), { maxLength: 6 }),
    })
    .map(({ series }) => ({
      season: 2026,
      updatedAt: '2026-10-05T18:00:00Z',
      series,
    }));
}

describe('findIntegrityWarnings (property-based)', () => {
  it('never throws and only ever flags placeholder team ids in finished contexts', () => {
    fc.assert(
      fc.property(bracketArb(), (bracket) => {
        const warnings = findIntegrityWarnings(bracket);

        for (const warning of warnings) {
          // Invariant 1: the flagged teamId is always a placeholder.
          expect(warning.teamId in TEAMS).toBe(false);

          const series = bracket.series.find((s) => s.id === warning.seriesId);
          expect(series).toBeDefined();

          if (warning.scope === 'series') {
            // Invariant 2: series-scope only from a final series, and the
            // teamId is one of that series' two seeds.
            expect(series!.status).toBe('final');
            expect([series!.high.teamId, series!.low.teamId]).toContain(
              warning.teamId,
            );
            expect(warning.gamePk).toBeUndefined();
          } else {
            // Invariant 3: game-scope only from a decided game, and the teamId
            // is one of that game's two teams.
            const game = series!.games.find((g) => g.gamePk === warning.gamePk);
            expect(game).toBeDefined();
            expect(
              game!.away.isWinner === true || game!.home.isWinner === true,
            ).toBe(true);
            expect([game!.away.teamId, game!.home.teamId]).toContain(
              warning.teamId,
            );
          }
        }
      }),
    );
  });

  it('returns a de-duplicated list (no two identical warnings)', () => {
    fc.assert(
      fc.property(bracketArb(), (bracket) => {
        const warnings = findIntegrityWarnings(bracket);
        const keys = warnings.map(
          (w) => `${w.code}|${w.seriesId}|${w.scope}|${w.teamId}|${w.gamePk ?? ''}`,
        );
        expect(new Set(keys).size).toBe(keys.length);
      }),
    );
  });
});
