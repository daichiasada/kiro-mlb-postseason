import type { Bracket, PredictionResponse } from '@mlb/shared';
import { getSeedBracket } from '@mlb/shared';
import { API_BASE_URL } from './config';

/** Error surfaced to the UI when an API request fails. */
export class ApiError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Result of a bracket load, flagging whether the offline seed was used. */
export interface BracketResult {
  bracket: Bracket;
  /** True when the live API was unreachable and the bundled seed was used. */
  usedFallback: boolean;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, init);
  } catch (cause) {
    throw new ApiError(
      `Network request to ${path} failed`,
      undefined,
    );
  }
  if (!response.ok) {
    throw new ApiError(
      `Request to ${path} failed with status ${response.status}`,
      response.status,
    );
  }
  return (await response.json()) as T;
}

/**
 * Fetches the postseason bracket for a season.
 *
 * On any network/API failure, falls back to the bundled `@mlb/shared` seed
 * bracket (when available for the season) so the demo renders offline. The
 * returned `usedFallback` flag lets the UI show a gentle notice.
 */
export async function getBracket(season: number): Promise<BracketResult> {
  try {
    const bracket = await requestJson<Bracket>(`/bracket?season=${season}`);
    return { bracket, usedFallback: false };
  } catch (error) {
    const seed = getSeedBracket(season);
    if (seed) {
      return { bracket: seed, usedFallback: true };
    }
    throw error instanceof ApiError
      ? error
      : new ApiError(`Unable to load bracket for ${season}`);
  }
}

/**
 * Fetches a win/loss prediction response for a single series.
 *
 * Returns the {@link PredictionResponse} discriminated union: `mode:'prediction'`
 * carries the numeric result, while `mode:'results'` and `mode:'upcoming'`
 * carry a message the UI shows instead. All three are HTTP 200; the UI branches
 * on `mode`. Throws an {@link ApiError} the UI can display on transport/HTTP
 * failures (no silent fallback).
 *
 * The optional `accuracy` is the model sharpness control in the range [0, 1]
 * (default 0.5 on the backend). When provided it is appended as the
 * `&accuracy=` query param so the backend's `predict()` can sharpen or soften
 * the favorite's probability. The probability always stays within [0.5, 0.95]
 * regardless of accuracy.
 */
export async function getPrediction(
  seriesId: string,
  season: number,
  accuracy?: number,
): Promise<PredictionResponse> {
  let query = `?seriesId=${encodeURIComponent(seriesId)}&season=${season}`;
  if (accuracy !== undefined) {
    query += `&accuracy=${encodeURIComponent(accuracy)}`;
  }
  return requestJson<PredictionResponse>(`/prediction${query}`);
}
