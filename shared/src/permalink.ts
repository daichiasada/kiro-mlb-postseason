/**
 * Pure permalink / share-URL builders for Issue #21. Both the backend (to emit
 * canonical and image URLs in the crawler HTML) and the frontend (to render a
 * "copy share link" button) import these so the URL shapes stay identical.
 *
 * This module is intentionally dependency-free.
 */
import type { ShareLang } from './share.js';

/** Strip a single trailing slash so joins never produce a double slash. */
function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

/**
 * Absolute deep link into the SPA for a single series, e.g.
 * `https://app.example.com/season/2024/series/al-wc-1?lang=ja`. The `lang`
 * query is appended only when provided.
 */
export function buildSeriesPermalink(input: {
  origin: string;
  season: number;
  seriesId: string;
  lang?: ShareLang;
}): string {
  const base = `${trimTrailingSlash(input.origin)}/season/${input.season}/series/${encodeURIComponent(
    input.seriesId,
  )}`;
  return input.lang ? `${base}?lang=${input.lang}` : base;
}

/**
 * Absolute crawler-facing URL (`/share/...`) that returns the static
 * OpenGraph/Twitter meta HTML and redirects a human into the SPA. The `lang`
 * query is appended only when provided.
 */
export function buildShareUrl(input: {
  origin: string;
  season: number;
  seriesId: string;
  lang?: ShareLang;
}): string {
  const base = `${trimTrailingSlash(input.origin)}/share/season/${input.season}/series/${encodeURIComponent(
    input.seriesId,
  )}`;
  return input.lang ? `${base}?lang=${input.lang}` : base;
}

/**
 * Absolute OG-image URL served by the backend `/og` endpoint, e.g.
 * `https://api.example.com/og?season=2024&seriesId=al-wc-1&lang=en`.
 */
export function buildOgImageUrl(input: {
  apiBase: string;
  season: number;
  seriesId: string;
  lang: ShareLang;
}): string {
  const base = trimTrailingSlash(input.apiBase);
  return `${base}/og?season=${input.season}&seriesId=${encodeURIComponent(input.seriesId)}&lang=${input.lang}`;
}
