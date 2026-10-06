import { describe, expect, it } from 'vitest';
import { DEFAULT_TEAM_COLOR, TEAM_COLORS, teamColor } from './teamColors.js';

describe('teamColor', () => {
  it('returns the known brand color for a mapped team id', () => {
    expect(teamColor(119)).toEqual({ primary: '#005a9c', secondary: '#ef3e42' }); // Dodgers
    expect(teamColor(147)).toEqual(TEAM_COLORS[147]); // Yankees
  });

  it('falls back to the default color for an unknown team id', () => {
    expect(teamColor(999999)).toEqual(DEFAULT_TEAM_COLOR);
  });

  it('exposes a non-empty color map', () => {
    expect(Object.keys(TEAM_COLORS).length).toBeGreaterThan(0);
  });
});
