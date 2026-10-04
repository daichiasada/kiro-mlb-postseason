/**
 * Season configuration: the single source of truth for the app's notion of
 * "now" and which seasons are selectable.
 *
 * Keeping these values in one dependency-free module (importable by both the
 * backend and the frontend from `@mlb/shared`) avoids scattering the literal
 * `2026` across the codebase. To advance the app to a new year, change
 * {@link CURRENT_YEAR} (and extend {@link SELECTABLE_SEASONS}) here only.
 */

/**
 * The app's current year ("now"). Seasons before this are completed and shown
 * as results only; this season is the in-progress, predictable one.
 */
export const CURRENT_YEAR = 2026;

/**
 * Seasons offered in the UI selector, newest-first so the current year surfaces
 * at the top of the list.
 */
export const SELECTABLE_SEASONS: readonly number[] = [2026, 2025, 2024];

/** Whether a season is a completed results view or the predictable current one. */
export type SeasonMode = 'results' | 'predictable';

/**
 * Pure classifier for a season's status.
 *
 * Any season strictly before {@link CURRENT_YEAR} is `'results'` (completed,
 * results-only); the current year is `'predictable'` (in-progress, prediction
 * feature enabled). Future seasons also fall back to `'results'`.
 */
export function seasonMode(season: number): SeasonMode {
  return season === CURRENT_YEAR ? 'predictable' : 'results';
}

/** Convenience: true when the season is completed / results-only. */
export function isResultsOnly(season: number): boolean {
  return seasonMode(season) === 'results';
}

/** Convenience: true when the season is the current, predictable one. */
export function isPredictable(season: number): boolean {
  return seasonMode(season) === 'predictable';
}
