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
