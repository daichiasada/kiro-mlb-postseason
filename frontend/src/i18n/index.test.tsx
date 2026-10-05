import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  DEFAULT_LANG,
  I18nProvider,
  LANG_STORAGE_KEY,
  createTranslator,
  interpolate,
  readLangFromQuery,
  readStoredLang,
  roundName,
  statusLabel,
  teamAbbr,
  teamName,
  useI18n,
} from './index';
import { MESSAGES } from './messages';

describe('i18n translator', () => {
  it('looks up a key for both languages', () => {
    expect(createTranslator('en')('prediction.favorite')).toBe('Favorite');
    expect(createTranslator('ja')('prediction.favorite')).toBe('優勢');
  });

  it('interpolates {param} placeholders', () => {
    expect(interpolate('Best of {n}', { n: 7 })).toBe('Best of 7');
    // Unknown placeholders are left intact; extra params are ignored.
    expect(interpolate('{a}-{b}', { a: 'x' })).toBe('x-{b}');
  });

  it('fills params through t()', () => {
    const en = createTranslator('en');
    expect(en('app.loading', { season: 2026 })).toBe(
      'Loading the 2026 postseason…',
    );
    const ja = createTranslator('ja');
    expect(ja('app.loading', { season: 2026 })).toBe(
      '2026年のポストシーズンを読み込み中…',
    );
  });

  it('falls back to the key itself when a template is missing', () => {
    const t = createTranslator('en');
    // @ts-expect-error - exercising the defensive missing-key path.
    expect(t('does.not.exist')).toBe('does.not.exist');
  });
});

describe('message dictionary parity', () => {
  it('defines exactly the same keys in both en and ja (incl. favorites keys)', () => {
    const enKeys = Object.keys(MESSAGES.en).sort();
    const jaKeys = Object.keys(MESSAGES.ja).sort();
    expect(jaKeys).toEqual(enKeys);
  });

  it('has non-empty values for every key in both languages', () => {
    for (const lang of ['en', 'ja'] as const) {
      for (const [key, value] of Object.entries(MESSAGES[lang])) {
        expect(value, `${lang}:${key}`).toBeTruthy();
      }
    }
  });

  it('includes the Eliminated / 敗退 favorites string', () => {
    expect(MESSAGES.en['favorites.eliminated']).toBe('Eliminated');
    expect(MESSAGES.ja['favorites.eliminated']).toBe('敗退');
  });
});

describe('roundName / statusLabel helpers', () => {
  const en = createTranslator('en');
  const ja = createTranslator('ja');

  it('localizes round names in both languages', () => {
    expect(roundName(en, 'World Series')).toBe('World Series');
    expect(roundName(ja, 'World Series')).toBe('ワールドシリーズ');
    expect(roundName(ja, 'Wild Card')).toBe('ワイルドカード');
  });

  it('localizes series statuses in both languages', () => {
    expect(statusLabel(en, 'final')).toBe('Final');
    expect(statusLabel(ja, 'final')).toBe('終了');
    expect(statusLabel(ja, 'in_progress')).toBe('進行中');
  });
});

describe('teamName / teamAbbr fallback', () => {
  const en = createTranslator('en');
  const ja = createTranslator('ja');

  it('returns the English club name for a known id in both languages', () => {
    // 119 = Los Angeles Dodgers (English club name in both languages).
    expect(teamName(en, 119)).toBe('Los Angeles Dodgers');
    expect(teamName(ja, 119)).toBe('Los Angeles Dodgers');
    expect(teamAbbr(en, 119)).toBe('LAD');
    expect(teamAbbr(ja, 119)).toBe('LAD');
  });

  it('renders a LOCALIZED placeholder for an unknown/preview id (never "Team <id>")', () => {
    // 5513 is the real 2026 preview-data id that previously showed as "Team 5513".
    expect(teamName(en, 5513)).toBe('TBD (#5513)');
    expect(teamName(ja, 5513)).toBe('未定 (#5513)');
    expect(teamName(en, 5513)).not.toContain('Team 5513');
    expect(teamName(ja, 5513)).not.toContain('Team 5513');

    // The compact abbreviation spot uses the same localized placeholder.
    expect(teamAbbr(en, 5513)).toBe('TBD (#5513)');
    expect(teamAbbr(ja, 5513)).toBe('未定 (#5513)');
  });
});

describe('language persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to Japanese', () => {
    expect(DEFAULT_LANG).toBe('ja');
  });

  it('round-trips the chosen language through localStorage', () => {
    expect(readStoredLang()).toBeNull();

    localStorage.setItem(LANG_STORAGE_KEY, 'en');
    expect(readStoredLang()).toBe('en');

    localStorage.setItem(LANG_STORAGE_KEY, 'ja');
    expect(readStoredLang()).toBe('ja');
  });

  it('ignores an invalid stored value', () => {
    localStorage.setItem(LANG_STORAGE_KEY, 'fr');
    expect(readStoredLang()).toBeNull();
  });
});

/**
 * A tiny probe that renders the active language's localized app title string so
 * a test can assert which language the provider hydrated into.
 */
function LangProbe() {
  const { lang, t } = useI18n();
  return (
    <>
      <span data-testid="lang">{lang}</span>
      <span data-testid="loading">{t('app.loading', { season: 2026 })}</span>
    </>
  );
}

describe('?lang= query param on load', () => {
  const originalSearch = window.location.search;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    // Restore the jsdom URL between tests so one case cannot leak into another.
    window.history.replaceState(null, '', `/${originalSearch}`);
  });

  function setSearch(search: string): void {
    window.history.replaceState(null, '', `/${search}`);
  }

  it('reads a valid lang from the query string', () => {
    setSearch('?lang=en');
    expect(readLangFromQuery()).toBe('en');
    setSearch('?lang=ja');
    expect(readLangFromQuery()).toBe('ja');
  });

  it('returns null for a missing or invalid lang query', () => {
    setSearch('');
    expect(readLangFromQuery()).toBeNull();
    setSearch('?lang=fr');
    expect(readLangFromQuery()).toBeNull();
  });

  it('opens in English when ?lang=en is present', () => {
    setSearch('?lang=en');
    render(
      <I18nProvider>
        <LangProbe />
      </I18nProvider>,
    );
    expect(screen.getByTestId('lang')).toHaveTextContent('en');
    expect(screen.getByTestId('loading')).toHaveTextContent(
      'Loading the 2026 postseason…',
    );
    // The query language is persisted so later (query-less) navigation keeps it.
    expect(readStoredLang()).toBe('en');
  });

  it('opens in Japanese when ?lang=ja is present', () => {
    setSearch('?lang=ja');
    render(
      <I18nProvider>
        <LangProbe />
      </I18nProvider>,
    );
    expect(screen.getByTestId('lang')).toHaveTextContent('ja');
    expect(screen.getByTestId('loading')).toHaveTextContent(
      '2026年のポストシーズンを読み込み中…',
    );
    expect(readStoredLang()).toBe('ja');
  });

  it('takes precedence over a persisted language', () => {
    localStorage.setItem(LANG_STORAGE_KEY, 'ja');
    setSearch('?lang=en');
    render(
      <I18nProvider>
        <LangProbe />
      </I18nProvider>,
    );
    expect(screen.getByTestId('lang')).toHaveTextContent('en');
  });

  it('falls back to the stored language for an invalid ?lang= value', () => {
    localStorage.setItem(LANG_STORAGE_KEY, 'en');
    setSearch('?lang=fr');
    render(
      <I18nProvider>
        <LangProbe />
      </I18nProvider>,
    );
    expect(screen.getByTestId('lang')).toHaveTextContent('en');
  });

  it('falls back to the default language when ?lang= is invalid and nothing is stored', () => {
    setSearch('?lang=fr');
    render(
      <I18nProvider>
        <LangProbe />
      </I18nProvider>,
    );
    expect(screen.getByTestId('lang')).toHaveTextContent(DEFAULT_LANG);
  });
});
