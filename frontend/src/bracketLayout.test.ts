import { describe, it, expect } from 'vitest';
import {
  buildRoundColumns,
  clinchWins,
  seriesLeaderId,
  ROUND_ORDER,
} from './bracketLayout';
import { sampleBracket, wildCardSeries, worldSeries } from './test/fixtures';

describe('buildRoundColumns', () => {
  it('orders columns by round progression and only includes populated rounds', () => {
    const columns = buildRoundColumns(sampleBracket);
    expect(columns.map((c) => c.round)).toEqual(['Wild Card', 'World Series']);
    expect(ROUND_ORDER.indexOf(columns[0].round)).toBeLessThan(
      ROUND_ORDER.indexOf(columns[1].round),
    );
  });

  it('places the matching series in its round column', () => {
    const columns = buildRoundColumns(sampleBracket);
    const wc = columns.find((c) => c.round === 'Wild Card');
    expect(wc?.series.map((s) => s.id)).toEqual([wildCardSeries.id]);
  });
});

describe('seriesLeaderId', () => {
  it('returns the leading team id', () => {
    expect(seriesLeaderId(wildCardSeries)).toBe(116); // Tigers lead 2-0
    expect(seriesLeaderId(worldSeries)).toBe(119); // Dodgers lead 4-1
  });

  it('returns null when tied', () => {
    expect(
      seriesLeaderId({ ...wildCardSeries, high: { teamId: 117, wins: 1 }, low: { teamId: 116, wins: 1 } }),
    ).toBeNull();
  });
});

describe('clinchWins', () => {
  it('computes wins needed to clinch', () => {
    expect(clinchWins(3)).toBe(2);
    expect(clinchWins(5)).toBe(3);
    expect(clinchWins(7)).toBe(4);
  });
});
