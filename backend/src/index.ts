/**
 * @mlb/backend barrel export.
 *
 * Re-exports the API Gateway Lambda handlers under distinct names so the CDK
 * infra can reference them, plus the service and pure-logic modules for reuse
 * and testing.
 */
export { handler as getBracketHandler } from './handlers/getBracket.js';
export { handler as getPredictionHandler } from './handlers/getPrediction.js';

export { BracketService, SeriesNotFoundError } from './service/bracketService.js';
export { aggregateBracket, mapRound, mapLeague } from './mlb/aggregate.js';
export { fetchPostseasonSchedule, MlbApiError } from './mlb/client.js';
export { predict } from './predict/model.js';
export {
  generateNarrative,
  buildPrompt,
  fallbackNarrative,
  DEFAULT_MODEL_ID,
  RealBedrockInvoker,
  type BedrockInvoker,
} from './bedrock/narrative.js';
export { DynamoBracketStore, type BracketStore } from './store/dynamo.js';
