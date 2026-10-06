import { describe, it, expect } from 'vitest';
import {
  contrastRatio,
  readableTextColor,
  relativeLuminance,
} from './readableTextColor';
import { teamColor } from './teamColors';

/**
 * The team ids present in the TEAM_COLORS table (teamColors.ts). Kept in sync
 * with that module; iterating it exercises EVERY team's brand color plus the
 * DEFAULT_COLOR fallback (via an id not in the table).
 */
const TEAM_IDS = [
  110, 114, 116, 117, 118, 119, 121, 135, 139, 143, 144, 145, 147, 158,
];

/** An id guaranteed NOT in the table so teamColor() returns DEFAULT_COLOR. */
const UNKNOWN_TEAM_ID = 999999;

describe('readableTextColor', () => {
  it('picks black text on a white background and white text on black', () => {
    expect(readableTextColor('#ffffff')).toBe('#000000');
    expect(readableTextColor('#000000')).toBe('#ffffff');
  });

  it('accepts shorthand #rgb and is case-insensitive', () => {
    expect(readableTextColor('#FFF')).toBe('#000000');
    expect(readableTextColor('#000')).toBe('#ffffff');
  });

  it('falls back safely (black bg -> white text) for malformed input', () => {
    // Parsed as the black fallback, so white gives the better contrast.
    expect(readableTextColor('not-a-color')).toBe('#ffffff');
    expect(readableTextColor('')).toBe('#ffffff');
  });
});

describe('contrastRatio', () => {
  it('is 21:1 for black vs white and order-independent', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
  });

  it('is 1:1 for a color against itself', () => {
    expect(contrastRatio('#1b3a6b', '#1b3a6b')).toBeCloseTo(1, 5);
  });

  it('matches a known WCAG luminance (white=1, black=0)', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
  });
});

describe('all-team-colors AA contrast', () => {
  it('the chosen badge text clears AA (>=4.5:1) on every team primary', () => {
    for (const id of TEAM_IDS) {
      const { primary } = teamColor(id);
      const text = readableTextColor(primary);
      const ratio = contrastRatio(text, primary);
      expect(
        ratio,
        `team ${id} primary ${primary} -> text ${text} ratio ${ratio.toFixed(2)}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('the chosen text clears AA on every team secondary color too', () => {
    for (const id of TEAM_IDS) {
      const { secondary } = teamColor(id);
      const text = readableTextColor(secondary);
      const ratio = contrastRatio(text, secondary);
      expect(
        ratio,
        `team ${id} secondary ${secondary} -> text ${text} ratio ${ratio.toFixed(2)}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('covers the DEFAULT_COLOR fallback for unknown team ids', () => {
    const { primary, secondary } = teamColor(UNKNOWN_TEAM_ID);
    expect(contrastRatio(readableTextColor(primary), primary)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(
      contrastRatio(readableTextColor(secondary), secondary),
    ).toBeGreaterThanOrEqual(4.5);
  });
});
