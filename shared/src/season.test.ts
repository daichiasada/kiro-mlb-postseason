import { describe, expect, it } from 'vitest';
import {
  CURRENT_YEAR,
  SELECTABLE_SEASONS,
  isPredictable,
  isResultsOnly,
  seasonMode,
} from './season.js';

describe('season config', () => {
  it('pins the app "now" to 2026', () => {
    expect(CURRENT_YEAR).toBe(2026);
  });

  it('offers 2024, 2025 and 2026 as selectable seasons', () => {
    expect([...SELECTABLE_SEASONS].sort((a, b) => a - b)).toEqual([2024, 2025, 2026]);
  });
});

describe('seasonMode', () => {
  it('treats seasons before the current year as results-only', () => {
    expect(seasonMode(2024)).toBe('results');
    expect(seasonMode(2025)).toBe('results');
  });

  it('treats the current year as predictable', () => {
    expect(seasonMode(2026)).toBe('predictable');
  });

  it('treats future seasons as results-only', () => {
    expect(seasonMode(2027)).toBe('results');
  });
});

describe('mode convenience helpers', () => {
  it('isResultsOnly mirrors seasonMode', () => {
    expect(isResultsOnly(2024)).toBe(true);
    expect(isResultsOnly(2025)).toBe(true);
    expect(isResultsOnly(2026)).toBe(false);
  });

  it('isPredictable mirrors seasonMode', () => {
    expect(isPredictable(2026)).toBe(true);
    expect(isPredictable(2024)).toBe(false);
  });
});
