/**
 * Lightweight in-repo i18n layer.
 *
 * We deliberately DO NOT pull in a runtime i18n dependency (e.g. react-i18next
 * + i18next): the app has a small, fixed set of UI strings and two languages,
 * so a React context plus a flat message dictionary covers every need with zero
 * added bundle weight and no extra API surface to learn. The public API is a
 * single `useI18n()` hook returning `{ lang, setLang, t }` plus the localized
 * `roundName()`, `statusLabel()`, and `teamName()` helpers.
 */
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { TEAMS } from '@mlb/shared';
import type { RoundName, Series } from '@mlb/shared';
import {
  LANGS,
  MESSAGES,
  ROUND_KEY,
  STATUS_KEY,
  type Lang,
  type MessageKey,
} from './messages';

export type { Lang, MessageKey } from './messages';
export { LANGS } from './messages';

/**
 * Default UI language. Japanese is chosen because the site's own feature
 * requests came in Japanese, so a Japanese-speaking audience is the primary
 * one; English is one tap away via the header toggle.
 */
export const DEFAULT_LANG: Lang = 'ja';

/** localStorage key the chosen language is persisted under. */
export const LANG_STORAGE_KEY = 'mlb.lang';

type Params = Record<string, string | number>;

/** The translation function: dictionary lookup + simple `{param}` fill-in. */
export type TFn = (key: MessageKey, params?: Params) => string;

export interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: TFn;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value);
}

/**
 * Reads the persisted language from localStorage, guarding access so the module
 * is safe under SSR / jsdom where `localStorage` may be absent or throw.
 */
export function readStoredLang(): Lang | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(LANG_STORAGE_KEY);
    return isLang(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Persists the chosen language, swallowing any storage errors. */
function storeLang(lang: Lang): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* ignore write failures (private mode, quota, SSR) */
  }
}

/** Fills `{param}` placeholders in a template from the params map. */
export function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/** Builds a bound translation function for a language. */
export function createTranslator(lang: Lang): TFn {
  const table = MESSAGES[lang];
  return (key, params) => {
    const template = table[key] ?? key;
    return interpolate(template, params);
  };
}

/** Localized round name (e.g. "World Series" / "ワールドシリーズ"). */
export function roundName(t: TFn, round: RoundName): string {
  return t(ROUND_KEY[round]);
}

/** Localized series status label (scheduled / in_progress / final). */
export function statusLabel(t: TFn, status: Series['status']): string {
  return t(STATUS_KEY[status]);
}

/**
 * Centralized team-name resolution shared by every panel. Known teams render
 * their English club name (TEAMS[id].name) in both languages; an unknown or
 * preview id (not in TEAMS) renders a LOCALIZED placeholder - never the raw
 * "Team <id>" string that previously leaked (e.g. "Team 5513").
 */
export function teamName(t: TFn, teamId: number): string {
  return TEAMS[teamId]?.name ?? t('team.unknown', { id: teamId });
}

/**
 * Centralized abbreviation resolution for compact spots (game score lines).
 * Known teams use their abbreviation; unknown/preview ids fall back to the same
 * localized placeholder so no raw numeric id leaks.
 */
export function teamAbbr(t: TFn, teamId: number): string {
  return TEAMS[teamId]?.abbreviation ?? t('team.unknown', { id: teamId });
}

export function I18nProvider({
  children,
  initialLang,
}: {
  children: ReactNode;
  /** Overrides the hydrated/default language (used in tests). */
  initialLang?: Lang;
}) {
  const [lang, setLangState] = useState<Lang>(
    () => initialLang ?? readStoredLang() ?? DEFAULT_LANG,
  );

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    storeLang(next);
  }, []);

  const t = useMemo<TFn>(() => createTranslator(lang), [lang]);

  const value = useMemo<I18nContextValue>(
    () => ({ lang, setLang, t }),
    [lang, setLang, t],
  );

  return createElement(I18nContext.Provider, { value }, children);
}

/** Access the active language, a setter, and the translation function. */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return ctx;
}
