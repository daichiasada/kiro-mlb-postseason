/**
 * Pure, deterministic OpenGraph image builder for Issue #21. Produces a
 * 1200x630 SVG string for a single series: a split background in the two
 * teams' brand colors, both team names, the current series score, a
 * round/season label, the shared model's favorite + win probability, and the
 * localized share disclaimer as a footer.
 *
 * It is a single pure function with no I/O so it can be unit-tested and reused
 * by the backend `/og` Lambda without native image dependencies. Some crawlers
 * do not rasterize SVG og:image; that trade-off is documented in the specs.
 */
import { predict } from './predict.js';
import { SHARE_DISCLAIMER, type ShareLang } from './share.js';
import { teamColor } from './teamColors.js';
import { TEAMS, type Bracket, type Series } from './types.js';

const WIDTH = 1200;
const HEIGHT = 630;

/** Escape text for safe inclusion in SVG/XML attribute and element content. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Display name for a team id, with a placeholder for unknown ids. */
function teamDisplayName(teamId: number): string {
  return TEAMS[teamId]?.name ?? `Team ${teamId}`;
}

/** Localized round + season label, e.g. "Division Series · 2024". */
function roundLabel(series: Series, season: number, lang: ShareLang): string {
  const en = `${series.round} · ${season}`;
  if (lang === 'en') return en;
  const JA_ROUND: Record<string, string> = {
    'Wild Card': 'ワイルドカード',
    'Division Series': 'ディビジョンシリーズ',
    'Championship Series': 'リーグ優勝決定シリーズ',
    'World Series': 'ワールドシリーズ',
  };
  return `${JA_ROUND[series.round] ?? series.round} · ${season}`;
}

/**
 * Build a deterministic 1200x630 OG SVG for a single series.
 */
export function buildOgImageSvg(input: { series: Series; season: number; lang: ShareLang }): string {
  const { series, season, lang } = input;

  const highId = series.high.teamId;
  const lowId = series.low.teamId;
  const highName = teamDisplayName(highId);
  const lowName = teamDisplayName(lowId);
  const highColor = teamColor(highId);
  const lowColor = teamColor(lowId);

  // Series score as "high.wins-low.wins".
  const score = `${series.high.wins}-${series.low.wins}`;

  // Favorite + win probability from the shared pure model. Wrap the single
  // series in a minimal bracket so predict() stays the single source of truth.
  const bracket: Bracket = { season, updatedAt: '', series: [series] };
  const { favoriteTeamId, favoriteWinProbability } = predict(series, bracket);
  const favoriteName = teamDisplayName(favoriteTeamId);
  const percent = `${Math.round(favoriteWinProbability * 100)}%`;
  const favoriteLine =
    lang === 'ja'
      ? `予測: ${favoriteName} 勝利確率 ${percent}`
      : `Prediction: ${favoriteName} to win · ${percent}`;

  const label = roundLabel(series, season, lang);
  const disclaimer = SHARE_DISCLAIMER[lang];

  const half = WIDTH / 2;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeXml(`${highName} vs ${lowName}`)}">`,
    `<rect x="0" y="0" width="${half}" height="${HEIGHT}" fill="${escapeXml(highColor.primary)}"/>`,
    `<rect x="${half}" y="0" width="${half}" height="${HEIGHT}" fill="${escapeXml(lowColor.primary)}"/>`,
    `<rect x="0" y="${HEIGHT - 90}" width="${WIDTH}" height="90" fill="#0f172a" fill-opacity="0.85"/>`,
    `<text x="${half}" y="90" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" fill="#ffffff">${escapeXml(label)}</text>`,
    `<text x="${half}" y="250" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="54" font-weight="bold" fill="#ffffff">${escapeXml(highName)}</text>`,
    `<text x="${half}" y="320" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="40" fill="#ffffff">vs</text>`,
    `<text x="${half}" y="390" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="54" font-weight="bold" fill="#ffffff">${escapeXml(lowName)}</text>`,
    `<text x="${half}" y="465" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="60" font-weight="bold" fill="#ffffff">${escapeXml(score)}</text>`,
    `<text x="${half}" y="520" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" fill="#ffffff">${escapeXml(favoriteLine)}</text>`,
    `<text x="${half}" y="${HEIGHT - 32}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="26" fill="#e2e8f0">${escapeXml(disclaimer)}</text>`,
    `</svg>`,
  ].join('');
}
