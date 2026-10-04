/**
 * Property-based tests for the deterministic prediction model.
 *
 * These exercise the REAL {@link predict} function with randomized but valid
 * series inputs and assert the model's documented invariants hold for every
 * generated case:
 *
 *   - favoriteWinProbability is always within the clamped range [0.5, 0.95].
 *   - favoriteTeamId is always one of the two teams in the series.
 *   - these hold for every accuracy, including values beyond the supported
 *     [0, 1] range (which the model clamps), and the model stays deterministic.
 *
 * Property-based testing is an IDE-only Kiro University lesson; fast-check's
 * generators (fc.assert / fc.property) drive hundreds of cases per invariant.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Bracket, RoundName, Series, SeriesLeague } from '@mlb/shared';
import { predict } from './model.js';

/** Known MLB Stats API team ids present in the shared TEAMS table. */
const TEAM_IDS = [110, 114, 116, 117, 118, 119, 121, 135, 143, 144, 147, 158];

const ROUNDS: RoundName[] = [
  'Wild Card',
  'Division Series',
  'Championship Series',
  'World Series',
];

const LEAGUES: SeriesLeague[] = ['AL', 'NL', 'WS'];

/**
 * Generates a structurally valid {@link Series}: two distinct team ids, a
 * best-of in {3,5,7}, and win counts for each side that never exceed the
 * clinch count (ceil(bestOf / 2)).
 */
function seriesArb(): fc.Arbitrary<Series> {
  return fc
    .record({
      bestOf: fc.constantFrom(3, 5, 7),
      pair: fc
        .uniqueArray(fc.constantFrom(...TEAM_IDS), { minLength: 2, maxLength: 2 })
        .map(([a, b]) => [a!, b!] as const),
      round: fc.constantFrom(...ROUNDS),
      league: fc.constantFrom(...LEAGUES),
      status: fc.constantFrom('scheduled' as const, 'in_progress' as const, 'final' as const),
    })
    .chain((base) => {
      const clinch = Math.ceil(base.bestOf / 2);
      return fc
        .record({
          highWins: fc.integer({ min: 0, max: clinch }),
          lowWins: fc.integer({ min: 0, max: clinch }),
        })
        .map(({ highWins, lowWins }) => {
          const [highId, lowId] = base.pair;
          const series: Series = {
            id: `2024-${base.league.toLowerCase()}-round-${highId}-${lowId}`,
            round: base.round,
            league: base.league,
            high: { teamId: highId, wins: highWins },
            low: { teamId: lowId, wins: lowWins },
            bestOf: base.bestOf,
            status: base.status,
            games: [],
          };
          return series;
        });
    });
}

/** A random regular-season win-pct map covering the two series teams. */
function winPctArb(series: Series): fc.Arbitrary<Record<number, number>> {
  return fc.record({
    high: fc.double({ min: 0.3, max: 0.7, noNaN: true }),
    low: fc.double({ min: 0.3, max: 0.7, noNaN: true }),
  }).map(({ high, low }) => ({
    [series.high.teamId]: high,
    [series.low.teamId]: low,
  }));
}

function bracketOf(series: Series): Bracket {
  return { season: 2024, updatedAt: '2024-10-01T00:00:00.000Z', series: [series] };
}

/**
 * A random accuracy that samples across the supported [0, 1] range AND slightly
 * beyond it (down to -0.5 and up to 1.5) to exercise the model's clamping of
 * out-of-range inputs.
 */
function accuracyArb(): fc.Arbitrary<number> {
  return fc.double({ min: -0.5, max: 1.5, noNaN: true });
}

describe('predict (property-based)', () => {
  it('always returns a probability within [0.5, 0.95]', () => {
    fc.assert(
      fc.property(seriesArb(), (series) => {
        const result = predict(series, bracketOf(series));
        expect(result.favoriteWinProbability).toBeGreaterThanOrEqual(0.5);
        expect(result.favoriteWinProbability).toBeLessThanOrEqual(0.95);
      }),
    );
  });

  it('always picks a favorite that is one of the two series teams', () => {
    fc.assert(
      fc.property(seriesArb(), (series) => {
        const result = predict(series, bracketOf(series));
        expect([series.high.teamId, series.low.teamId]).toContain(result.favoriteTeamId);
      }),
    );
  });

  it('holds both invariants with randomized regular-season win pct', () => {
    fc.assert(
      fc.property(
        seriesArb().chain((series) =>
          winPctArb(series).map((winPct) => ({ series, winPct })),
        ),
        ({ series, winPct }) => {
          const result = predict(series, bracketOf(series), winPct);
          expect(result.favoriteWinProbability).toBeGreaterThanOrEqual(0.5);
          expect(result.favoriteWinProbability).toBeLessThanOrEqual(0.95);
          expect([series.high.teamId, series.low.teamId]).toContain(result.favoriteTeamId);
        },
      ),
    );
  });

  it('is deterministic: identical inputs yield identical outputs', () => {
    fc.assert(
      fc.property(seriesArb(), (series) => {
        const a = predict(series, bracketOf(series));
        const b = predict(series, bracketOf(series));
        expect(a).toEqual(b);
      }),
    );
  });

  it('holds all invariants for any accuracy, including out-of-range values', () => {
    fc.assert(
      fc.property(
        seriesArb().chain((series) =>
          accuracyArb().map((accuracy) => ({ series, accuracy })),
        ),
        ({ series, accuracy }) => {
          const result = predict(series, bracketOf(series), {}, accuracy);
          expect(result.favoriteWinProbability).toBeGreaterThanOrEqual(0.5);
          expect(result.favoriteWinProbability).toBeLessThanOrEqual(0.95);
          expect([series.high.teamId, series.low.teamId]).toContain(result.favoriteTeamId);
        },
      ),
    );
  });

  it('is deterministic for identical (series, accuracy) inputs', () => {
    fc.assert(
      fc.property(
        seriesArb().chain((series) =>
          accuracyArb().map((accuracy) => ({ series, accuracy })),
        ),
        ({ series, accuracy }) => {
          const a = predict(series, bracketOf(series), {}, accuracy);
          const b = predict(series, bracketOf(series), {}, accuracy);
          expect(a).toEqual(b);
        },
      ),
    );
  });
});
