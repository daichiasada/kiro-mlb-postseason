/**
 * Pure, deterministic cache-key derivation for prediction responses.
 *
 * A prediction depends only on the series situation and the narrative knobs, so
 * two requests that share them should serve the SAME cached response and skip a
 * billable Bedrock call. Two requests that differ in ANY of those inputs (most
 * importantly a change in the series win counts, which signals a game result
 * update) must map to a DIFFERENT key, which effectively invalidates the cache.
 *
 * The key format is:
 *   `PREDICTION#<seriesId>#<highWins>-<lowWins>#<language>#<modelId>#<accuracy>`
 *
 * It is a plain string with no I/O so it can be unit-tested in isolation. The
 * `accuracy` component is normalized to a stable string via {@link String} so
 * the same logical situation always yields the same key; callers must resolve
 * an undefined accuracy to the model default (DEFAULT_ACCURACY = 0.5) BEFORE
 * building the key.
 */
import type { NarrativeLanguage } from '@mlb/shared';

export interface PredictionCacheKeyInput {
  /** The resolved series id (e.g. `2026-al-wildcard-117-116`). */
  seriesId: string;
  /** Current wins for the high seed - a change here invalidates the cache. */
  highWins: number;
  /** Current wins for the low seed - a change here invalidates the cache. */
  lowWins: number;
  /** The resolved narrative language. */
  language: NarrativeLanguage;
  /** The resolved (allowlisted) Bedrock model id. */
  modelId: string;
  /** The resolved accuracy knob (default DEFAULT_ACCURACY when unset). */
  accuracy: number;
}

/**
 * Builds the deterministic DynamoDB partition key for a cached prediction.
 *
 * @see PredictionCacheKeyInput for the components and their invalidation role.
 */
export function predictionCacheKey(input: PredictionCacheKeyInput): string {
  const { seriesId, highWins, lowWins, language, modelId, accuracy } = input;
  return `PREDICTION#${seriesId}#${highWins}-${lowWins}#${language}#${modelId}#${String(
    accuracy,
  )}`;
}
