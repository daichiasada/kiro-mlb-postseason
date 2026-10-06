/**
 * Pure, framework-free favorites model.
 *
 * This module holds the small, testable core of the favorite-teams feature: the
 * localStorage key, guarded read/store helpers (mirroring
 * {@link readStoredTheme}/{@link storeTheme} in `./theme` and
 * {@link readStoredLang}/`storeLang` in `./i18n`), and PURE array helpers that
 * add/remove/toggle a team id immutably. Multiple favorites are allowed. The
 * React glue lives in `./FavoritesContext.tsx`.
 *
 * A favorite is an MLB Stats API team id (a finite, non-negative integer). The
 * stored value is a JSON array of such ids. Any corrupt/foreign content (a
 * non-JSON string, a non-array, or entries that are not finite integers) is
 * ignored so a bad localStorage value can never crash the app.
 */

/** localStorage key the favorite team ids are persisted under. */
export const FAVORITES_STORAGE_KEY = 'mlb.favorites';

/** True iff `value` is a finite, non-negative integer usable as a team id. */
function isTeamId(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0
  );
}

/**
 * De-duplicates a list of ids, preserving first-seen order. Pure.
 */
function dedupe(ids: readonly number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/**
 * Reads the persisted favorite team ids, guarding access so the module is safe
 * under SSR / jsdom where `localStorage` may be absent or throw. Returns `[]`
 * for an absent, non-JSON, or otherwise invalid value. Only finite integer ids
 * survive; strings, NaN, floats, and duplicates are dropped (de-duplicated
 * preserving first-seen order).
 */
export function readStoredFavorites(): number[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return dedupe(parsed.filter(isTeamId));
  } catch {
    return [];
  }
}

/** Persists the favorite team ids, swallowing any storage errors. */
export function storeFavorites(ids: number[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* ignore write failures (private mode, quota, SSR) */
  }
}

/** True iff `id` is in `ids`. Pure. */
export function isFavorite(ids: readonly number[], id: number): boolean {
  return ids.includes(id);
}

/**
 * Returns a NEW array with `id` added (idempotent: no duplicate is created if
 * `id` is already present). Pure; never mutates the input.
 */
export function addFavorite(ids: readonly number[], id: number): number[] {
  return isFavorite(ids, id) ? [...ids] : [...ids, id];
}

/**
 * Returns a NEW array with `id` removed. Pure; never mutates the input.
 */
export function removeFavorite(ids: readonly number[], id: number): number[] {
  return ids.filter((existing) => existing !== id);
}

/**
 * Returns a NEW array with `id` toggled: removed if present, added if absent.
 * Pure; never mutates the input.
 */
export function toggleFavorite(ids: readonly number[], id: number): number[] {
  return isFavorite(ids, id) ? removeFavorite(ids, id) : addFavorite(ids, id);
}
