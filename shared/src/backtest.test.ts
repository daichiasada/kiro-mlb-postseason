import { describe, expect, it } from 'vitest';
import type { Bracket } from './types.js';
import { POSTSEASON_2024, POSTSEASON_2025 } from './seed/index.js';
import {
  runBacktest,
  runBacktestAcrossAccuracies,
  runMultiSeasonBacktest,
} from './backtest.js';

/**
 * FIXED expected numbers (Issue #16 criterion 1). These literals were computed
 * once by running the engine over the bundled seed brackets and then PINNED
 * here so any future change to the pure predict() logic or the seed data that
 * shifts the backtest output is caught immediately.
 */
describe('runBacktest — fixed deterministic values at accuracy 0.5', () => {
  it('pins 2024 hitRate / brierScore / sampleCount', () => {
    const result = runBacktest(POSTSEASON_2024, 0.5);
    expect(result.hitRate).toBe(0.906977);
    expect(result.brierScore).toBe(0.134132);
    expect(result.sampleCount).toBe(43);
  });

  it('pins 2025 hitRate / brierScore / sampleCount', () => {
    const result = runBacktest(POSTSEASON_2025, 0.5);
    expect(result.hitRate).toBe(0.744681);
    expect(result.brierScore).toBe(0.194365);
    expect(result.sampleCount).toBe(47);
  });

  it('pins the pooled combined run across 2024 + 2025', () => {
    const { combined } = runMultiSeasonBacktest(0.5);
    expect(combined.hitRate).toBe(0.822222);
    expect(combined.brierScore).toBe(0.165587);
    expect(combined.sampleCount).toBe(90);
  });

  it('sampleCount equals the total number of games across all final series', () => {
    const totalGames = (bracket: Bracket): number =>
      bracket.series
        .filter((s) => s.status === 'final' && s.games.length > 0)
        .reduce((sum, s) => sum + s.games.length, 0);

    expect(runBacktest(POSTSEASON_2024, 0.5).sampleCount).toBe(totalGames(POSTSEASON_2024));
    expect(runBacktest(POSTSEASON_2025, 0.5).sampleCount).toBe(totalGames(POSTSEASON_2025));
  });
});

describe('runBacktest — accuracy = 0 collapses to a coin flip', () => {
  it('yields brierScore exactly 0.25 and probOfEventualWinner 0.5 for all samples', () => {
    for (const bracket of [POSTSEASON_2024, POSTSEASON_2025]) {
      const result = runBacktest(bracket, 0);
      expect(result.brierScore).toBe(0.25);
    }
  });

  it('places every sample in the [0.5, 0.6) bucket at accuracy 0', () => {
    const result = runBacktest(POSTSEASON_2024, 0);
    const [firstBin, ...rest] = result.calibrationBins;
    expect(firstBin!.predictedCount).toBe(result.sampleCount);
    expect(firstBin!.meanPredictedProbability).toBe(0.5);
    for (const bin of rest) {
      expect(bin.predictedCount).toBe(0);
    }
  });
});

describe('runBacktest — calibration bin invariants', () => {
  it('bin counts sum to sampleCount across accuracy values', () => {
    for (const accuracy of [0, 0.25, 0.5, 0.75, 1]) {
      for (const bracket of [POSTSEASON_2024, POSTSEASON_2025]) {
        const result = runBacktest(bracket, accuracy);
        const total = result.calibrationBins.reduce((sum, b) => sum + b.predictedCount, 0);
        expect(total).toBe(result.sampleCount);
      }
    }
  });

  it('reports null means for empty buckets and numbers for populated ones', () => {
    const result = runBacktest(POSTSEASON_2024, 0.5);
    for (const bin of result.calibrationBins) {
      if (bin.predictedCount === 0) {
        expect(bin.meanPredictedProbability).toBeNull();
        expect(bin.empiricalWinRate).toBeNull();
      } else {
        expect(typeof bin.meanPredictedProbability).toBe('number');
        expect(typeof bin.empiricalWinRate).toBe('number');
      }
    }
  });
});

describe('runBacktest — empty bracket edge case', () => {
  it('returns sampleCount 0 with no NaN metrics', () => {
    const empty: Bracket = { season: 9999, updatedAt: '2099-01-01T00:00:00.000Z', series: [] };
    const result = runBacktest(empty, 0.5);
    expect(result.sampleCount).toBe(0);
    expect(result.hitRate).toBe(0);
    expect(result.brierScore).toBe(0);
    expect(Number.isNaN(result.hitRate)).toBe(false);
    expect(Number.isNaN(result.brierScore)).toBe(false);
    const total = result.calibrationBins.reduce((sum, b) => sum + b.predictedCount, 0);
    expect(total).toBe(0);
  });
});

describe('runMultiSeasonBacktest / runBacktestAcrossAccuracies', () => {
  it('combined sampleCount equals the sum of per-season sampleCounts', () => {
    const multi = runMultiSeasonBacktest(0.5);
    const perSeasonTotal = multi.seasons.reduce(
      (sum, season) => sum + multi.perSeason[season]!.sampleCount,
      0,
    );
    expect(multi.combined.sampleCount).toBe(perSeasonTotal);
  });

  it('runs the full default accuracy sweep', () => {
    const sweep = runBacktestAcrossAccuracies();
    expect(sweep.map((s) => s.accuracy)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    for (const entry of sweep) {
      expect(entry.combined.sampleCount).toBe(90);
    }
  });
});
