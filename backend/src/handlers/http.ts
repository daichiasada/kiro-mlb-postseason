/**
 * Shared HTTP helpers for the API Gateway (HTTP API) Lambda handlers:
 * CORS-enabled JSON responses and a season query parser.
 */
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { CURRENT_YEAR } from '@mlb/shared';

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Content-Type': 'application/json',
};

/** Builds a CORS-enabled JSON response. */
export function jsonResponse(
  statusCode: number,
  body: unknown,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

/**
 * Default season when none is supplied by the caller. Derived from the shared
 * {@link CURRENT_YEAR} so the app's notion of "now" lives in one place rather
 * than being a scattered literal.
 */
export const DEFAULT_SEASON = CURRENT_YEAR;

/**
 * Parses a season from a query string value. Returns a valid 4-digit year or
 * `undefined` when the input is malformed.
 */
export function parseSeason(value: string | undefined): number | undefined {
  if (value === undefined) return DEFAULT_SEASON;
  if (!/^\d{4}$/.test(value)) return undefined;
  const season = Number(value);
  return Number.isInteger(season) ? season : undefined;
}

/**
 * Parses the optional prediction `accuracy` control from a request value
 * (query string or JSON body, either a string or number). Returns `undefined`
 * for a missing value so the service/model default applies, and for any
 * non-numeric input (accuracy is a best-effort tuning knob, not a hard
 * validation gate like season). A valid number is returned as-is; the model
 * clamps it into its supported [0, 1] range.
 */
export function parseAccuracy(value: string | number | undefined): number | undefined {
  if (value === undefined || value === null) return undefined;
  const accuracy = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(accuracy) ? accuracy : undefined;
}
