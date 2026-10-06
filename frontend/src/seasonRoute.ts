import type { Bracket } from '@mlb/shared';
import { DEFAULT_SEASON, SELECTABLE_SEASONS } from './config';

/**
 * Parses the `:season` route param into a known selectable season.
 *
 * Falls back to {@link DEFAULT_SEASON} for a missing, non-numeric, or
 * unsupported value so a malformed URL never breaks the page.
 */
export function parseSeasonParam(raw: string | undefined): number {
  if (!raw) return DEFAULT_SEASON;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) return DEFAULT_SEASON;
  return SELECTABLE_SEASONS.includes(parsed) ? parsed : DEFAULT_SEASON;
}

/**
 * Whether a series has started: at least one game has been decided (a real
 * winner) or at least one win has been recorded. The live MLB Stats API lists
 * not-yet-played games as "Preview" entries with null scores and null winners,
 * so a preview-only series has games but has decided nothing and is NOT
 * started. This matches the aggregator (which classifies such a series as
 * `scheduled`) and the backend `upcoming` guard, so all three agree on the
 * real 2026 preview-game shape.
 */
export function hasSeriesStarted(series: Bracket['series'][number]): boolean {
  if (series.high.wins > 0 || series.low.wins > 0) return true;
  return series.games.some(
    (game) => game.away.isWinner === true || game.home.isWinner === true,
  );
}

/**
 * Whether a bracket has any "real" postseason content to render. A current
 * season (e.g. 2026) can return only placeholder/preview series that have not
 * started. In that case the bracket is treated as upcoming/empty so the UI
 * shows a friendly message instead of a broken-looking grid.
 */
export function hasStartedContent(bracket: Bracket): boolean {
  return bracket.series.some(hasSeriesStarted);
}
