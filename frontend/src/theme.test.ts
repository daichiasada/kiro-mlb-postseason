import { describe, it, expect, beforeEach } from 'vitest';
import {
  THEME_STORAGE_KEY,
  readStoredTheme,
  resolveTheme,
  storeTheme,
} from './theme';

describe('resolveTheme (pure)', () => {
  it("returns the explicit preference for 'light'/'dark' regardless of OS", () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it("maps 'system' to the OS preference", () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('readStoredTheme / storeTheme', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips each valid preference', () => {
    for (const pref of ['light', 'dark', 'system'] as const) {
      storeTheme(pref);
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(pref);
      expect(readStoredTheme()).toBe(pref);
    }
  });

  it('returns null when absent', () => {
    expect(readStoredTheme()).toBeNull();
  });

  it('returns null for an invalid stored value', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'rainbow');
    expect(readStoredTheme()).toBeNull();
  });
});
