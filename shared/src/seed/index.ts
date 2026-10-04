import type { Bracket } from '../types.js';
import postseason2024 from './postseason-2024.json' with { type: 'json' };

/**
 * Deterministic bundled dataset for the 2024 MLB postseason.
 *
 * Aggregated from the public MLB Stats API
 * (https://statsapi.mlb.com/api/v1/schedule/postseason?sportId=1&season=2024)
 * and used as a fallback when the live API is unreachable at request time.
 */
export const POSTSEASON_2024: Bracket = postseason2024 as Bracket;

/** Returns the bundled seed bracket for a given season, if available. */
export function getSeedBracket(season: number): Bracket | undefined {
  if (season === 2024) {
    return POSTSEASON_2024;
  }
  return undefined;
}
