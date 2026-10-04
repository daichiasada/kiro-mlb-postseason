/**
 * Orchestrates the bracket and prediction flows, wiring together the MLB client,
 * aggregation, DynamoDB cache, the prediction model, and the Bedrock narrative.
 *
 * All collaborators are injectable so the service can be unit-tested without a
 * network or AWS access.
 */
import { getSeedBracket, type Bracket, type Prediction, type Series } from '@mlb/shared';
import { aggregateBracket } from '../mlb/aggregate.js';
import { fetchPostseasonSchedule } from '../mlb/client.js';
import { predict, type WinPctMap } from '../predict/model.js';
import {
  generateNarrative,
  RealBedrockInvoker,
  type BedrockInvoker,
} from '../bedrock/narrative.js';
import { DynamoBracketStore, type BracketStore } from '../store/dynamo.js';

export interface BracketServiceDeps {
  store?: BracketStore;
  fetchSchedule?: typeof fetchPostseasonSchedule;
  bedrockInvoker?: BedrockInvoker;
  /** Optional regular-season win pct per team id for the prediction model. */
  winPct?: WinPctMap;
}

/** Error thrown when a requested series cannot be found in the bracket. */
export class SeriesNotFoundError extends Error {
  constructor(seriesId: string) {
    super(`Series not found: ${seriesId}`);
    this.name = 'SeriesNotFoundError';
  }
}

export class BracketService {
  private readonly store: BracketStore;
  private readonly fetchSchedule: typeof fetchPostseasonSchedule;
  private readonly bedrockInvoker: BedrockInvoker;
  private readonly winPct: WinPctMap;

  constructor(deps: BracketServiceDeps = {}) {
    this.store = deps.store ?? new DynamoBracketStore();
    this.fetchSchedule = deps.fetchSchedule ?? fetchPostseasonSchedule;
    this.bedrockInvoker = deps.bedrockInvoker ?? new RealBedrockInvoker();
    this.winPct = deps.winPct ?? {};
  }

  /**
   * Returns the bracket for a season. Resolution order:
   *   1. DynamoDB cache (hit).
   *   2. Live MLB Stats API fetch + aggregate + cache.
   *   3. On MLB failure, the bundled seed when season === 2024, else rethrow.
   */
  async getBracket(season: number): Promise<Bracket> {
    const cached = await this.store.getCachedBracket(season);
    if (cached) {
      return cached;
    }

    try {
      const games = await this.fetchSchedule(season);
      const bracket = aggregateBracket(games, season);
      await this.store.putCachedBracket(bracket);
      return bracket;
    } catch (error) {
      const seed = getSeedBracket(season);
      if (seed) {
        return seed;
      }
      throw error;
    }
  }

  /** Loads the bracket, finds the series, predicts, and builds a narrative. */
  async getPrediction(seriesId: string, season: number): Promise<Prediction> {
    const bracket = await this.getBracket(season);
    const series = bracket.series.find((s: Series) => s.id === seriesId);
    if (!series) {
      throw new SeriesNotFoundError(seriesId);
    }

    const result = predict(series, bracket, this.winPct);
    const { narrative, model } = await generateNarrative(series, result, this.bedrockInvoker);

    return {
      seriesId,
      favoriteTeamId: result.favoriteTeamId,
      favoriteWinProbability: result.favoriteWinProbability,
      narrative,
      model,
      generatedAt: new Date().toISOString(),
    };
  }
}
