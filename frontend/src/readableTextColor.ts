/**
 * Pure WCAG-contrast helpers used to auto-pick a legible text color on top of
 * an arbitrary team brand color (see {@link TeamBadge}).
 *
 * These functions implement the WCAG 2.x relative-luminance and contrast-ratio
 * formulas so the chosen foreground always clears the AA threshold (>=4.5:1 for
 * normal text) against each team's primary fill, rather than hardcoding white.
 */

/** Black / white are the only two candidates we ever draw badge text in. */
type Mono = '#000000' | '#ffffff';

/** A safe neutral fill assumed when the input hex cannot be parsed. */
const FALLBACK_RGB: readonly [number, number, number] = [0, 0, 0];

/**
 * Parses a `#rgb` or `#rrggbb` hex string into 0-255 channels. Returns a safe
 * fallback (black) for malformed input so callers never throw on bad data.
 */
function parseHex(hex: string): [number, number, number] {
  if (typeof hex !== 'string') return [...FALLBACK_RGB];
  let value = hex.trim();
  if (value.startsWith('#')) value = value.slice(1);

  // Expand shorthand #rgb -> #rrggbb.
  if (/^[0-9a-fA-F]{3}$/.test(value)) {
    value = value
      .split('')
      .map((c) => c + c)
      .join('');
  }

  if (!/^[0-9a-fA-F]{6}$/.test(value)) return [...FALLBACK_RGB];

  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return [r, g, b];
}

/** Linearizes a single sRGB channel (0-255) per the WCAG definition. */
function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance (0 = black, 1 = white) for a hex color. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * WCAG contrast ratio between two hex colors. Always >= 1; black vs white is
 * the maximum of 21. Order-independent.
 */
export function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Picks black or white text for the best contrast against `hex`. Returns
 * whichever yields the higher contrast ratio; ties resolve to black (which
 * matches the WCAG guidance of preferring darker text when equal).
 */
export function readableTextColor(hex: string): Mono {
  const againstBlack = contrastRatio(hex, '#000000');
  const againstWhite = contrastRatio(hex, '#ffffff');
  // Prefer black on ties: strictly greater white contrast is required to pick white.
  return againstWhite > againstBlack ? '#ffffff' : '#000000';
}
