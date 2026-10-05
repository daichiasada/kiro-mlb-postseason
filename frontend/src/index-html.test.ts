import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  THEME_STORAGE_KEY,
  THEME_PREFERENCES,
  type ThemePreference,
} from './theme';

/**
 * Sync guard for the pre-paint flash-prevention bootstrap in `index.html`.
 *
 * That inline <script> MUST run before the module graph loads, so it re-implements
 * the storage key and the light/dark/system resolve rule as literals, decoupled
 * from `theme.ts`. These assertions tie the literals back to `theme.ts`, so a
 * future rename of THEME_STORAGE_KEY, a change to the valid preference values, or
 * a change of the applied attribute silently diverging first-paint from the
 * mounted app will fail this test instead of shipping a theme flash.
 */
describe('index.html theme bootstrap stays in sync with theme.ts', () => {
  // Vitest runs with the @mlb/frontend workspace as cwd, so index.html sits at
  // the workspace root alongside this src/ tree.
  const htmlPath = resolve(process.cwd(), 'index.html');
  const html = readFileSync(htmlPath, 'utf8');

  it("references the THEME_STORAGE_KEY ('mlb.theme') from theme.ts", () => {
    expect(THEME_STORAGE_KEY).toBe('mlb.theme');
    expect(html).toContain(`localStorage.getItem('${THEME_STORAGE_KEY}')`);
  });

  it('handles every valid theme preference value', () => {
    // THEME_PREFERENCES is ['system', 'light', 'dark']. The explicit themes
    // ('light'/'dark') appear as literals in the passthrough branch; 'system'
    // is handled implicitly as the OS-fallback (else) branch rather than a
    // literal, so assert each one in the way the bootstrap encodes it.
    const explicit: ThemePreference[] = ['light', 'dark'];
    for (const pref of explicit) {
      expect(html).toContain(`'${pref}'`);
    }
    // Explicit light/dark passthrough branch (anything else => OS fallback).
    expect(html).toContain("pref === 'light' || pref === 'dark'");
    // Guard: if THEME_PREFERENCES ever changes shape, revisit this test.
    expect([...THEME_PREFERENCES].sort()).toEqual(['dark', 'light', 'system']);
  });

  it("applies the resolved theme via the same data-theme attribute", () => {
    expect(html).toContain("setAttribute('data-theme'");
  });

  it('resolves to light/dark the same way resolveTheme does', () => {
    // 'system'/absent falls back to the OS preference, dark when it matches.
    expect(html).toContain("'(prefers-color-scheme: dark)'");
    expect(html).toMatch(/systemDark\s*\?\s*'dark'\s*:\s*'light'/);
  });
});
