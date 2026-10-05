import { describe, expect, it } from 'vitest';
import type { RawStandingsResponse } from '../mlb/client.js';
import { winPctFromStandings, teamMetric } from './standings.js';

/**
 * A fixture standings response modeled on the real MLB Stats API shape: several
 * teams across both leagues, each division one entry in `records`. Values use
 * both the leading-dot (`.580`) and leading-zero (`0.512`) notations the API
 * is known to return.
 */
const fixture: RawStandingsResponse = {
  records: [
    {
      teamRecords: [
        { team: { id: 147, name: 'New York Yankees' }, winningPercentage: '.580' },
        { team: { id: 110, name: 'Baltimore Orioles' }, winningPercentage: '0.562' },
      ],
    },
    {
      teamRecords: [
        { team: { id: 119, name: 'Los Angeles Dodgers' }, winningPercentage: '.605' },
        { team: { id: 135, name: 'San Diego Padres' }, winningPercentage: '0.512' },
      ],
    },
  ],
};

describe('winPctFromStandings', () => {
  it('maps every team id to its parsed win pct across both leagues', () => {
    expect(winPctFromStandings(fixture)).toEqual({
      147: 0.58,
      110: 0.562,
      119: 0.605,
      135: 0.512,
    });
  });

  it("parses both '.580' and '0.580' notations to the same number", () => {
    const response: RawStandingsResponse = {
      records: [
        {
          teamRecords: [
            { team: { id: 1 }, winningPercentage: '.580' },
            { team: { id: 2 }, winningPercentage: '0.580' },
          ],
        },
      ],
    };
    const map = winPctFromStandings(response);
    expect(map[1]).toBe(0.58);
    expect(map[2]).toBe(0.58);
  });

  it('returns {} for an empty response', () => {
    expect(winPctFromStandings({})).toEqual({});
  });

  it('returns {} when records have no teamRecords (early season)', () => {
    expect(winPctFromStandings({ records: [{}, { teamRecords: [] }] })).toEqual({});
  });

  it('skips entries with a missing team id or unparseable pct without throwing', () => {
    const response = {
      records: [
        {
          teamRecords: [
            // Missing team.id entirely.
            { team: {}, winningPercentage: '.600' },
            // Unparseable pct.
            { team: { id: 10 }, winningPercentage: 'N/A' },
            // Out-of-range pct is rejected.
            { team: { id: 11 }, winningPercentage: '1.5' },
            // Missing pct.
            { team: { id: 12 } },
            // A valid entry survives alongside the skipped ones.
            { team: { id: 13 }, winningPercentage: '.500' },
          ],
        },
      ],
    } as unknown as RawStandingsResponse;

    expect(winPctFromStandings(response)).toEqual({ 13: 0.5 });
  });
});

describe('teamMetric', () => {
  it('returns the win pct for a known team id', () => {
    const winPct = winPctFromStandings(fixture);
    expect(teamMetric(winPct, 147)).toEqual({ teamId: 147, winPct: 0.58 });
  });

  it('returns null win pct for an unknown team id', () => {
    const winPct = winPctFromStandings(fixture);
    expect(teamMetric(winPct, 999)).toEqual({ teamId: 999, winPct: null });
  });
});
