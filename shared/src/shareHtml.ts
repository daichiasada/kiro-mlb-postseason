/**
 * Pure crawler meta-tag HTML builder for Issue #21. Returns a minimal, static
 * HTML5 document whose <head> carries the OpenGraph/Twitter tags a social
 * crawler reads (incl. the localized disclaimer in og:description) and whose
 * <body> both links to and immediately redirects a human visitor into the SPA
 * (meta-refresh + inline location.replace).
 *
 * It is a single pure function with no I/O so it can be unit-tested and reused
 * by the backend `/share` Lambda.
 */
import { predict } from './predict.js';
import { SHARE_DISCLAIMER, type ShareLang } from './share.js';
import { TEAMS, type Bracket, type Series } from './types.js';

/** Escape text for safe inclusion in HTML element/attribute content. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function teamDisplayName(teamId: number): string {
  return TEAMS[teamId]?.name ?? `Team ${teamId}`;
}

/**
 * Build a complete minimal crawler HTML document for a single series.
 */
export function buildShareHtml(input: {
  series: Series;
  season: number;
  lang: ShareLang;
  appUrl: string;
  ogImageUrl: string;
  canonicalUrl: string;
}): string {
  const { series, season, lang, appUrl, ogImageUrl, canonicalUrl } = input;

  const highName = teamDisplayName(series.high.teamId);
  const lowName = teamDisplayName(series.low.teamId);
  const score = `${series.high.wins}-${series.low.wins}`;
  const matchup = `${highName} vs ${lowName}`;

  const bracket: Bracket = { season, updatedAt: '', series: [series] };
  const { favoriteTeamId, favoriteWinProbability } = predict(series, bracket);
  const favoriteName = teamDisplayName(favoriteTeamId);
  const percent = `${Math.round(favoriteWinProbability * 100)}%`;
  const disclaimer = SHARE_DISCLAIMER[lang];

  const title =
    lang === 'ja'
      ? `${matchup}（${season}）${score}`
      : `${matchup} (${season}) ${score}`;

  const summary =
    lang === 'ja'
      ? `${matchup} ${score}。予測: ${favoriteName} 勝利確率 ${percent}。${disclaimer}`
      : `${matchup} ${score}. Prediction: ${favoriteName} to win ${percent}. ${disclaimer}`;

  // Values placed inside HTML attributes/content are HTML-escaped; the URLs are
  // additionally safe because they are already percent-encoded by the permalink
  // builders. We escape them for HTML attribute context regardless.
  const t = escapeHtml(title);
  const d = escapeHtml(summary);
  const app = escapeHtml(appUrl);
  const img = escapeHtml(ogImageUrl);
  const canonical = escapeHtml(canonicalUrl);

  return [
    '<!DOCTYPE html>',
    `<html lang="${escapeHtml(lang)}">`,
    '<head>',
    '<meta charset="utf-8"/>',
    '<meta name="viewport" content="width=device-width, initial-scale=1"/>',
    `<title>${t}</title>`,
    `<meta name="description" content="${d}"/>`,
    `<link rel="canonical" href="${canonical}"/>`,
    '<meta property="og:type" content="website"/>',
    `<meta property="og:title" content="${t}"/>`,
    `<meta property="og:description" content="${d}"/>`,
    `<meta property="og:image" content="${img}"/>`,
    `<meta property="og:url" content="${canonical}"/>`,
    '<meta name="twitter:card" content="summary_large_image"/>',
    `<meta name="twitter:title" content="${t}"/>`,
    `<meta name="twitter:description" content="${d}"/>`,
    `<meta name="twitter:image" content="${img}"/>`,
    `<meta http-equiv="refresh" content="0;url=${app}"/>`,
    '</head>',
    '<body>',
    `<main><h1>${t}</h1><p>${d}</p>`,
    `<p><a href="${app}">${app}</a></p></main>`,
    `<script>location.replace(${JSON.stringify(appUrl)})</script>`,
    '</body>',
    '</html>',
  ].join('');
}
