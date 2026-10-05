/**
 * Resolves the backend API base URL.
 *
 * Resolution order (first non-empty wins):
 *   1. Runtime config: `window.__API_BASE_URL__`, injected by `/config.js`.
 *      CDK's BucketDeployment writes this file at deploy time so the hosted
 *      static bundle can be pointed at the deployed API without a rebuild.
 *   2. Build-time env: `import.meta.env.VITE_API_BASE_URL` (baked into the
 *      bundle by `vite build`), useful for local/preview builds.
 *   3. Local default: `http://localhost:3000` for `npm run dev` against a
 *      locally running API.
 */

import {
  CURRENT_YEAR,
  SELECTABLE_SEASONS,
  MIN_ACCURACY,
  MAX_ACCURACY,
  DEFAULT_ACCURACY,
  ACCURACY_STEP,
} from '@mlb/shared';
import { AUTO_REFRESH_INTERVAL_MS } from './useAutoRefresh';

declare global {
  interface Window {
    __API_BASE_URL__?: string;
  }
}

const LOCAL_DEFAULT = 'http://localhost:3000';

function readRuntimeConfig(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  const value = window.__API_BASE_URL__;
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function readBuildTimeConfig(): string | undefined {
  const value = import.meta.env.VITE_API_BASE_URL;
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

/** The resolved API base URL with any trailing slash removed. */
export const API_BASE_URL: string = (
  readRuntimeConfig() ??
  readBuildTimeConfig() ??
  LOCAL_DEFAULT
).replace(/\/+$/, '');

/**
 * The default season rendered when the app first loads: the shared
 * {@link CURRENT_YEAR} so the app's notion of "now" lives in one place rather
 * than being a scattered literal.
 */
export const DEFAULT_SEASON = CURRENT_YEAR;

/** Seasons offered in the UI selector (newest-first), re-exported from shared. */
export { SELECTABLE_SEASONS };

/**
 * The model-accuracy control bounds, default, and slider step. These are the
 * single shared contract from `@mlb/shared` (shared/src/accuracy.ts) that the
 * backend prediction model also consumes, so the slider range can never drift
 * from the range the model actually accepts. The default is 0.5 (an identity
 * transform) so the initial UI behavior is unchanged.
 */
export { MIN_ACCURACY, MAX_ACCURACY, DEFAULT_ACCURACY, ACCURACY_STEP };

/**
 * The background auto-refresh poll interval, in milliseconds.
 *
 * Production always uses the 60s {@link AUTO_REFRESH_INTERVAL_MS} default (tied
 * to the backend's ~15 minute bracket cache TTL). The only reason this is
 * resolved from an env var is to let the e2e suite inject a much shorter
 * interval so the "does not auto-poll" assertion can actually fail if the
 * polling gate were wrong, and so interval-driven polling can be verified
 * end-to-end. `VITE_AUTO_REFRESH_INTERVAL_MS` is read at build time (and is
 * never set for normal dev/prod builds); any unset or invalid value falls back
 * to the 60s production default, so production behavior cannot be weakened by
 * accident.
 */
function readAutoRefreshIntervalMs(): number {
  const raw = import.meta.env.VITE_AUTO_REFRESH_INTERVAL_MS;
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return AUTO_REFRESH_INTERVAL_MS;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : AUTO_REFRESH_INTERVAL_MS;
}

export const POLL_INTERVAL_MS: number = readAutoRefreshIntervalMs();
