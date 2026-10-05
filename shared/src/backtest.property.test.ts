/**
 * Property-based tests for the backtest engine.
 *
 * These exercise the REAL engine over the bundled 2024/2025 seed brackets
 * across randomized accuracy values in [0, 1] and assert the invariants that
 * define a well-formed backtest result:
 *
 *   - hitRate is a probability in [0, 1].
 *   - brierScore (mean squared error of the probability on the eventual
 *     winner) is in [0, 1].
 *   - every populated calibration bin's empiricalWinRate is in [0, 1].
 *   - the calibration bin counts always sum to sampleCount.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { POSTSEASON_2024, POSTSEASON_2025 } from './seed/index.js';
import { runBacktest } from './backtest.js';

describe('runBacktest — property invariants across random accuracy', () => {
  it('keeps hitRate, brierScore, and calibration within bounds', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.constantFrom(POSTSEASON_2024, POSTSEASON_2025),
        (accuracy, bracket) => {
          const result = runBacktest(bracket, accuracy);

          expect(result.hitRate).toBeGreaterThanOrEqual(0);
          expect(result.hitRate).toBeLessThanOrEqual(1);
          expect(result.brierScore).toBeGreaterThanOrEqual(0);
          expect(result.brierScore).toBeLessThanOrEqual(1);

          let binTotal = 0;
          for (const bin of result.calibrationBins) {
            binTotal += bin.predictedCount;
            if (bin.predictedCount > 0) {
              expect(bin.empiricalWinRate).not.toBeNull();
              expect(bin.empiricalWinRate!).toBeGreaterThanOrEqual(0);
              expect(bin.empiricalWinRate!).toBeLessThanOrEqual(1);
            }
          }
          expect(binTotal).toBe(result.sampleCount);
        },
      ),
      { numRuns: 100 },
    );
  });
});
