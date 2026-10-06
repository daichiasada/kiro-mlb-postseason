import type { Bracket } from '../types.js';
import postseason2024 from './postseason-2024.json' with { type: 'json' };
import postseason2025 from './postseason-2025.json' with { type: 'json' };

/**
 * Deterministic bundled datasets for completed MLB postseasons.
 *
 * Aggregated from the public MLB Stats API
 * (https://statsapi.mlb.com/api/v1/schedule/postseason?sportId=1&season=YYYY)
 * and used as a fallback when the live API is unreachable at request time.
 * Each dataset is committed with a stable `updatedAt` so the bundle is
 * deterministic.
 */
export const POSTSEASON_2024: Bracket = postseason2024 as Bracket;

/** Bundled seed bracket for the 2025 postseason (Dodgers over Blue Jays, 4-3). */
export const POSTSEASON_2025: Bracket = postseason2025 as Bracket;

/** Returns the bundled seed bracket for a given season, if available. */
export function getSeedBracket(season: number): Bracket | undefined {
  if (season === 2024) {
    return POSTSEASON_2024;
  }
  if (season === 2025) {
    return POSTSEASON_2025;
  }
  return undefined;
}
