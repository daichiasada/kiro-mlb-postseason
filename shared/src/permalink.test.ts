import { describe, expect, it } from 'vitest';
import { buildOgImageUrl, buildSeriesPermalink, buildShareUrl } from './permalink.js';

describe('buildSeriesPermalink', () => {
  it('appends ?lang= when lang is provided', () => {
    expect(
      buildSeriesPermalink({ origin: 'https://app.example.com', season: 2024, seriesId: 'al-wc-1', lang: 'ja' }),
    ).toBe('https://app.example.com/season/2024/series/al-wc-1?lang=ja');
  });

  it('omits the lang query when lang is undefined', () => {
    expect(
      buildSeriesPermalink({ origin: 'https://app.example.com', season: 2024, seriesId: 'al-wc-1' }),
    ).toBe('https://app.example.com/season/2024/series/al-wc-1');
  });

  it('normalizes a trailing slash on origin', () => {
    expect(
      buildSeriesPermalink({ origin: 'https://app.example.com/', season: 2025, seriesId: 'ws', lang: 'en' }),
    ).toBe('https://app.example.com/season/2025/series/ws?lang=en');
  });

  it('url-encodes the seriesId', () => {
    expect(
      buildSeriesPermalink({ origin: 'https://x.io', season: 2024, seriesId: 'al/wc 1', lang: 'en' }),
    ).toBe('https://x.io/season/2024/series/al%2Fwc%201?lang=en');
  });
});

describe('buildShareUrl', () => {
  it('produces the /share/... crawler URL with lang', () => {
    expect(
      buildShareUrl({ origin: 'https://app.example.com/', season: 2024, seriesId: 'nl-ds-1', lang: 'en' }),
    ).toBe('https://app.example.com/share/season/2024/series/nl-ds-1?lang=en');
  });

  it('omits lang when undefined', () => {
    expect(buildShareUrl({ origin: 'https://app.example.com', season: 2024, seriesId: 'nl-ds-1' })).toBe(
      'https://app.example.com/share/season/2024/series/nl-ds-1',
    );
  });
});

describe('buildOgImageUrl', () => {
  it('builds the /og image URL with ordered query and encoded seriesId', () => {
    expect(
      buildOgImageUrl({ apiBase: 'https://api.example.com/', season: 2024, seriesId: 'al/wc 1', lang: 'ja' }),
    ).toBe('https://api.example.com/og?season=2024&seriesId=al%2Fwc%201&lang=ja');
  });
});
