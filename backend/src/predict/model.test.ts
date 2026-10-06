import { describe, expect, it } from 'vitest';
import type { Bracket, Series } from '@mlb/shared';
import { predict } from './model.js';

function makeSeries(overrides: Partial<Series> = {}): Series {
  return {
    id: '2024-al-wildcard-117-116',
    round: 'Wild Card',
    league: 'AL',
    high: { teamId: 117, wins: 0 },
    low: { teamId: 116, wins: 0 },
    bestOf: 3,
    status: 'scheduled',
    games: [],
    ...overrides,
  };
}

function makeBracket(series: Series): Bracket {
  return { season: 2024, updatedAt: '2024-10-01T00:00:00.000Z', series: [series] };
}

describe('predict', () => {
  it('favors the team leading the series', () => {
    const series = makeSeries({
      high: { teamId: 117, wins: 0 },
      low: { teamId: 116, wins: 2 },
      status: 'final',
    });
    const result = predict(series, makeBracket(series));
    expect(result.favoriteTeamId).toBe(116);
  });

  it('clamps the probability to [0.5, 0.95]', () => {
    const sweeping = makeSeries({
      high: { teamId: 117, wins: 0 },
      low: { teamId: 116, wins: 2 },
      status: 'final',
    });
    const result = predict(sweeping, makeBracket(sweeping));
    expect(result.favoriteWinProbability).toBeGreaterThanOrEqual(0.5);
    expect(result.favoriteWinProbability).toBeLessThanOrEqual(0.95);
  });

  it('is deterministic for identical input', () => {
    const series = makeSeries({
      high: { teamId: 117, wins: 1 },
      low: { teamId: 116, wins: 1 },
      status: 'in_progress',
    });
    const a = predict(series, makeBracket(series));
    const b = predict(series, makeBracket(series));
    expect(a).toEqual(b);
  });

  it('breaks an even series toward the high seed (home-field edge)', () => {
    const even = makeSeries({
      high: { teamId: 117, wins: 1 },
      low: { teamId: 116, wins: 1 },
      status: 'in_progress',
    });
    const result = predict(even, makeBracket(even));
    expect(result.favoriteTeamId).toBe(117);
    expect(result.favoriteWinProbability).toBeGreaterThanOrEqual(0.5);
  });

  it('uses regular-season win pct when provided', () => {
    const scheduled = makeSeries({
      high: { teamId: 117, wins: 0 },
      low: { teamId: 116, wins: 0 },
      status: 'scheduled',
    });
    // Low seed has a far stronger regular-season record.
    const result = predict(scheduled, makeBracket(scheduled), { 116: 0.65, 117: 0.5 });
    expect(result.favoriteTeamId).toBe(116);
  });
});

describe('predict (configurable accuracy)', () => {
  // A favored series with a clear leader so the favorite's share sits above the
  // 0.5 floor, giving the accuracy transform something to move.
  function favoredSeries(): Series {
    return makeSeries({
      high: { teamId: 117, wins: 2 },
      low: { teamId: 116, wins: 0 },
      bestOf: 5,
      status: 'in_progress',
    });
  }

  it('reproduces today\'s behavior at the default accuracy (0.5)', () => {
    const series = favoredSeries();
    const bracket = makeBracket(series);
    // Omitting accuracy and passing the explicit default must be identical, and
    // both must equal the historical (pre-accuracy) output for this input.
    const omitted = predict(series, bracket);
    const explicitDefault = predict(series, bracket, {}, 0.5);
    expect(explicitDefault).toEqual(omitted);
    // Regression guard: pin the concrete default probability for this series.
    expect(omitted.favoriteTeamId).toBe(117);
    expect(omitted.favoriteWinProbability).toBe(0.8093);
  });

  it('is monotonic non-decreasing in accuracy for the favorite', () => {
    const series = favoredSeries();
    const bracket = makeBracket(series);
    const probs = [0, 0.25, 0.5, 0.75, 1].map(
      (a) => predict(series, bracket, {}, a).favoriteWinProbability,
    );
    for (let i = 1; i < probs.length; i += 1) {
      expect(probs[i]!).toBeGreaterThanOrEqual(probs[i - 1]!);
    }
    // Higher accuracy is strictly more confident than lower here.
    expect(probs[probs.length - 1]!).toBeGreaterThan(probs[0]!);
  });

  it('pushes a favored probability harder toward 0.95 as accuracy rises', () => {
    const series = favoredSeries();
    const bracket = makeBracket(series);
    const low = predict(series, bracket, {}, 0.1).favoriteWinProbability;
    const high = predict(series, bracket, {}, 0.95).favoriteWinProbability;
    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThanOrEqual(0.95);
    expect(low).toBeGreaterThanOrEqual(0.5);
  });

  it('collapses to the conservative floor (0.5) at accuracy 0', () => {
    const series = favoredSeries();
    const result = predict(series, makeBracket(series), {}, 0);
    expect(result.favoriteWinProbability).toBe(0.5);
    expect(result.favoriteTeamId).toBe(117);
  });

  it('clamps out-of-range accuracy to the supported [0, 1] range', () => {
    const series = favoredSeries();
    const bracket = makeBracket(series);
    // Below range behaves like 0; above range behaves like 1.
    expect(predict(series, bracket, {}, -5).favoriteWinProbability).toBe(
      predict(series, bracket, {}, 0).favoriteWinProbability,
    );
    expect(predict(series, bracket, {}, 42).favoriteWinProbability).toBe(
      predict(series, bracket, {}, 1).favoriteWinProbability,
    );
    // And every clamped result still respects [0.5, 0.95].
    for (const a of [-5, 0, 0.5, 1, 42, Number.NaN]) {
      const p = predict(series, bracket, {}, a).favoriteWinProbability;
      expect(p).toBeGreaterThanOrEqual(0.5);
      expect(p).toBeLessThanOrEqual(0.95);
    }
  });

  it('keeps the favorite team unchanged across accuracy values', () => {
    const series = favoredSeries();
    const bracket = makeBracket(series);
    for (const a of [0, 0.25, 0.5, 0.75, 1]) {
      expect(predict(series, bracket, {}, a).favoriteTeamId).toBe(117);
    }
  });

  it('treats a non-finite accuracy as the default', () => {
    const series = favoredSeries();
    const bracket = makeBracket(series);
    expect(predict(series, bracket, {}, Number.NaN)).toEqual(predict(series, bracket));
  });
});
