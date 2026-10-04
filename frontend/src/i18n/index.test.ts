import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_LANG,
  LANG_STORAGE_KEY,
  createTranslator,
  interpolate,
  readStoredLang,
  roundName,
  statusLabel,
  teamAbbr,
  teamName,
} from './index';

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
