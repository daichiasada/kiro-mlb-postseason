/**
 * Pure, framework-free theme model.
 *
 * This module holds the small, testable core of the dark-mode feature: the
 * preference/resolved types, the localStorage key, guarded read/store helpers
 * (mirroring {@link readStoredLang}/{@link storeLang} in `./i18n`), and a PURE
 * {@link resolveTheme} resolver. The React glue lives in `./theme.tsx`.
 */

/** What the user has chosen. `'system'` defers to the OS color scheme. */
export type ThemePreference = 'light' | 'dark' | 'system';

/** The concrete theme actually applied to the document. */
export type ResolvedTheme = 'light' | 'dark';

/** localStorage key the chosen theme preference is persisted under. */
export const THEME_STORAGE_KEY = 'mlb.theme';

/** The valid preferences, used for validation and for the toggle UI order. */
export const THEME_PREFERENCES: readonly ThemePreference[] = [
  'system',
  'light',
  'dark',
] as const;

function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === 'string' &&
    (THEME_PREFERENCES as readonly string[]).includes(value)
  );
}

/**
 * Reads the persisted theme preference, guarding access so the module is safe
 * under SSR / jsdom where `localStorage` may be absent or throw. Returns `null`
 * for an absent or invalid value so callers can fall back to `'system'`.
 */
export function readStoredTheme(): ThemePreference | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Persists the chosen preference, swallowing any storage errors. */
export function storeTheme(pref: ThemePreference): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    /* ignore write failures (private mode, quota, SSR) */
  }
}

/**
 * Resolves a preference to a concrete theme. Pure: `'light'`/`'dark'` map to
 * themselves; `'system'` maps to the OS preference.
 */
export function resolveTheme(
  pref: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (pref === 'light' || pref === 'dark') return pref;
  return systemPrefersDark ? 'dark' : 'light';
}

/**
 * Reads the OS dark-mode preference via `matchMedia`, guarded for environments
 * (jsdom/SSR) where `matchMedia` is undefined. Returns `false` when unknown.
 */
export function getSystemPrefersDark(): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}
