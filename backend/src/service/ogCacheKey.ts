/**
 * Pure, deterministic cache-key derivation for the share/OG endpoints.
 *
 * A generated OG image (and the matching share HTML) depends only on the series
 * situation (the current win counts) and the language, so two requests that
 * share them should serve the SAME cached bytes and skip a rebuild. Two
 * requests that differ in ANY of those inputs (most importantly a change in the
 * series win counts, which signals a game result update) must map to a
 * DIFFERENT key, which effectively invalidates the cache.
 *
 * Two key shapes are produced from the SAME inputs via a type prefix so the OG
 * image and its share HTML never collide in the single-table cache:
 *   - `OG#<seriesId>#<highWins>-<lowWins>#<lang>`     (the SVG image)
 *   - `SHARE#<seriesId>#<highWins>-<lowWins>#<lang>`  (the crawler HTML)
 *
 * These are plain strings with no I/O so they can be unit-tested in isolation,
 * mirroring {@link import('./predictionCacheKey.js').predictionCacheKey}.
 */
import type { ShareLang } from '@mlb/shared';

export interface OgCacheKeyInput {
  /** The resolved series id (e.g. `2024-al-wildcard-117-116`). */
  seriesId: string;
  /** Current wins for the high seed - a change here invalidates the cache. */
  highWins: number;
  /** Current wins for the low seed - a change here invalidates the cache. */
  lowWins: number;
  /** The resolved share language. */
  lang: ShareLang;
}

/** Builds the deterministic DynamoDB partition key for a cached OG image. */
export function ogCacheKey(input: OgCacheKeyInput): string {
  const { seriesId, highWins, lowWins, lang } = input;
  return `OG#${seriesId}#${highWins}-${lowWins}#${lang}`;
}

/**
 * Builds the deterministic DynamoDB partition key for a cached share HTML
 * document. Same components as {@link ogCacheKey} but with a `SHARE#` prefix so
 * the SVG and HTML payloads for one series never overwrite each other.
 */
export function shareCacheKey(input: OgCacheKeyInput): string {
  const { seriesId, highWins, lowWins, lang } = input;
  return `SHARE#${seriesId}#${highWins}-${lowWins}#${lang}`;
}
