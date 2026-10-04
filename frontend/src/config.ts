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

import { CURRENT_YEAR, SELECTABLE_SEASONS } from '@mlb/shared';

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
 * The model-accuracy control bounds and default, mirroring the backend's
 * MIN_ACCURACY / MAX_ACCURACY / DEFAULT_ACCURACY (backend/src/predict/model.ts).
 * The default is deliberately 0.5 so the initial UI behavior is unchanged (the
 * backend's default accuracy is also 0.5, an identity transform). The slider
 * steps in 0.05 increments across [0, 1].
 */
export const MIN_ACCURACY = 0;
export const MAX_ACCURACY = 1;
export const DEFAULT_ACCURACY = 0.5;
export const ACCURACY_STEP = 0.05;
