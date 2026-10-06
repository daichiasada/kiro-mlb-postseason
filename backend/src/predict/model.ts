/**
 * Transparent, deterministic win/loss prediction model.
 *
 * The pure prediction logic now lives in `@mlb/shared` (shared/src/predict.ts)
 * so the shared backtest engine and the frontend can import it without any
 * backend/network/Bedrock dependency. This module re-exports it verbatim so
 * every existing backend import path (backend/src/index.ts,
 * service/bracketService.ts, bedrock/narrative.ts, store/dynamo.ts,
 * predict/standings.ts) and the existing predict tests keep working unchanged;
 * predict's behavior is byte-identical.
 */
export { predict, teamName, MIN_ACCURACY, MAX_ACCURACY, DEFAULT_ACCURACY } from '@mlb/shared';
export type { PredictionResult, WinPctMap } from '@mlb/shared';
