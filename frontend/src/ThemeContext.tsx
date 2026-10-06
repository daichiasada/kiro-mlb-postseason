/**
 * React theme context (the glue in `./ThemeContext.tsx`) layered on top of the
 * pure helpers in `./theme`.
 *
 * The provider hydrates the preference from localStorage (defaulting to
 * `'system'`), resolves it to a concrete light/dark theme, applies it by
 * setting `data-theme` on `document.documentElement` so EVERY route inherits
 * it, and - while the preference is `'system'` - subscribes to the OS color
 * scheme via `matchMedia` so a live OS change flips the theme without a reload.
 *
 * Everything is guarded so the provider is inert (never throws) under jsdom.
 */
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  getSystemPrefersDark,
  readStoredTheme,
  resolveTheme,
  storeTheme,
  type ResolvedTheme,
  type ThemePreference,
} from './theme';

export interface ThemeContextValue {
  /** The user's choice (may be `'system'`). */
  preference: ThemePreference;
  /** The concrete theme currently applied to the document. */
  resolved: ResolvedTheme;
  /** Change (and persist) the preference. */
  setPreference: (pref: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Applies the resolved theme to `<html data-theme>` (guarded for SSR). */
function applyTheme(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', resolved);
}

export function ThemeProvider({
  children,
  initialPreference,
}: {
  children: ReactNode;
  /** Overrides the hydrated/default preference (used in tests). */
  initialPreference?: ThemePreference;
}) {
  const [preference, setPreferenceState] = useState<ThemePreference>(
    () => initialPreference ?? readStoredTheme() ?? 'system',
  );
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() =>
    getSystemPrefersDark(),
  );

  // Subscribe to OS color-scheme changes so `'system'` reacts live. The query
  // match drives `systemPrefersDark`; the effect below recomputes `resolved`.
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return;
    }
    const mql = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches);
    };
    // Keep state in sync with the current value on (re)subscribe.
    setSystemPrefersDark(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const resolved = useMemo<ResolvedTheme>(
    () => resolveTheme(preference, systemPrefersDark),
    [preference, systemPrefersDark],
  );

  // Apply to the document whenever the resolved theme changes.
  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  const setPreference = useCallback((pref: ThemePreference) => {
    setPreferenceState(pref);
    storeTheme(pref);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return createElement(ThemeContext.Provider, { value }, children);
}

/** Access the current preference, the resolved theme, and the setter. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
