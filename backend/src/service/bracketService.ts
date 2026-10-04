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

/**
 * Parses a series id of the form `${season}-${league}-${roundslug}-${highId}-${lowId}`
 * into its parts. Returns `null` for anything that does not match that shape.
 *
 * The round slug can itself contain no hyphens (it is lowercased and stripped
 * of non-alphanumerics in {@link aggregateBracket}), so the id is parsed from
 * both ends: the last two segments are the team ids, the first is the season,
 * the second is the league, and whatever is left in the middle is the slug.
 */
function parseSeriesId(seriesId: string): {
  season: string;
  league: string;
  roundSlug: string;
  idA: number;
  idB: number;
} | null {
  const parts = seriesId.split('-');
  if (parts.length < 5) {
    return null;
  }
  const lowId = Number(parts[parts.length - 1]);
  const highId = Number(parts[parts.length - 2]);
  if (!Number.isFinite(lowId) || !Number.isFinite(highId)) {
    return null;
  }
  const season = parts[0]!;
  const league = parts[1]!;
  const roundSlug = parts.slice(2, parts.length - 2).join('-');
  if (!roundSlug) {
    return null;
  }
  return { season, league, roundSlug, idA: highId, idB: lowId };
}

/** Lowercased round slug derived the same way as in {@link aggregateBracket}. */
function roundSlugOf(series: Series): string {
  return series.round.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Resolves a series from the bracket, tolerating a high/low-seed ordering
 * disagreement across the seed/live boundary (ISSUE-1). An exact id match is
 * tried first; if it fails, the requested id is parsed and matched by round
 * slug plus the *unordered* team-id pair, so a request for
 * `2024-ws-worldseries-147-119` still resolves the stored
 * `2024-ws-worldseries-119-147` series. Returns `null` only when neither
 * strategy finds a series.
 */
function resolveSeries(bracket: Bracket, seriesId: string): Series | null {
  const exact = bracket.series.find((s: Series) => s.id === seriesId);
  if (exact) {
    return exact;
  }

  const parsed = parseSeriesId(seriesId);
  if (!parsed) {
    return null;
  }

  const wantPair = [parsed.idA, parsed.idB].sort((x, y) => x - y);
  const fallback = bracket.series.find((s: Series) => {
    if (roundSlugOf(s) !== parsed.roundSlug) {
      return false;
    }
    const havePair = [s.high.teamId, s.low.teamId].sort((x, y) => x - y);
    return havePair[0] === wantPair[0] && havePair[1] === wantPair[1];
  });

  return fallback ?? null;
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
    const series = resolveSeries(bracket, seriesId);
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
