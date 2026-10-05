/**
 * Orchestrates the bracket and prediction flows, wiring together the MLB client,
 * aggregation, DynamoDB cache, the prediction model, and the Bedrock narrative.
 *
 * All collaborators are injectable so the service can be unit-tested without a
 * network or AWS access.
 */
import {
  getSeedBracket,
  isResultsOnly,
  resolveModelId,
  DEFAULT_NARRATIVE_LANGUAGE,
  DEFAULT_ACCURACY,
  type Bracket,
  type GameDetailResponse,
  type NarrativeLanguage,
  type PredictionResponse,
  type Series,
} from '@mlb/shared';
import { aggregateBracket } from '../mlb/aggregate.js';
import {
  fetchGameContent,
  fetchGameFeedLive,
  fetchGameLinescore,
  fetchPostseasonSchedule,
  fetchStandings,
} from '../mlb/client.js';
import {
  buildGameDetail,
  parseGameMeta,
  parseHighlight,
  parseLinescore,
} from '../mlb/gameDetail.js';
import { predict, type WinPctMap } from '../predict/model.js';
import { winPctFromStandings, teamMetric } from '../predict/standings.js';
import {
  generateNarrative,
  RealBedrockInvoker,
  type BedrockInvoker,
} from '../bedrock/narrative.js';
import {
  DynamoBracketStore,
  GAME_DETAIL_FINAL_TTL_SECONDS,
  GAME_DETAIL_LIVE_TTL_SECONDS,
  type BracketStore,
} from '../store/dynamo.js';
import { predictionCacheKey } from './predictionCacheKey.js';
import { emitCacheMetric } from '../metrics/emf.js';

export interface BracketServiceDeps {
  store?: BracketStore;
  fetchSchedule?: typeof fetchPostseasonSchedule;
  fetchStandings?: typeof fetchStandings;
  fetchGameLinescore?: typeof fetchGameLinescore;
  fetchGameFeedLive?: typeof fetchGameFeedLive;
  fetchGameContent?: typeof fetchGameContent;
  bedrockInvoker?: BedrockInvoker;
  /** Optional regular-season win pct per team id for the prediction model. */
  winPct?: WinPctMap;
}

/**
 * Whether a game state (MLB `abstractGameState`) represents a completed game.
 * Completed games are cached with the LONG TTL; everything else uses the SHORT
 * (live) TTL.
 */
function isCompletedGameState(gameState: string): boolean {
  const normalized = gameState.trim().toLowerCase();
  return normalized === 'final' || normalized === 'completed early' || normalized === 'game over';
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
 * Whether a series has actually started: it is not `scheduled` and at least one
 * game has been decided (a real winner) or a win has been recorded. The live
 * MLB Stats API lists not-yet-played games as "Preview" entries with null
 * scores and null winners, so a preview-only series has games but has decided
 * nothing and is treated as not-yet-started. This agrees with the aggregator,
 * which classifies such a series as `scheduled`.
 */
function hasStartedSeries(series: Series): boolean {
  if (series.status === 'scheduled') {
    return false;
  }
  if (series.high.wins > 0 || series.low.wins > 0) {
    return true;
  }
  return series.games.some(
    (game) => game.away.isWinner === true || game.home.isWinner === true,
  );
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
  private readonly fetchStandings: typeof fetchStandings;
  private readonly fetchGameLinescore: typeof fetchGameLinescore;
  private readonly fetchGameFeedLive: typeof fetchGameFeedLive;
  private readonly fetchGameContent: typeof fetchGameContent;
  private readonly bedrockInvoker: BedrockInvoker;
  private readonly winPct: WinPctMap;

  constructor(deps: BracketServiceDeps = {}) {
    this.store = deps.store ?? new DynamoBracketStore();
    this.fetchSchedule = deps.fetchSchedule ?? fetchPostseasonSchedule;
    this.fetchStandings = deps.fetchStandings ?? fetchStandings;
    this.fetchGameLinescore = deps.fetchGameLinescore ?? fetchGameLinescore;
    this.fetchGameFeedLive = deps.fetchGameFeedLive ?? fetchGameFeedLive;
    this.fetchGameContent = deps.fetchGameContent ?? fetchGameContent;
    this.bedrockInvoker = deps.bedrockInvoker ?? new RealBedrockInvoker();
    this.winPct = deps.winPct ?? {};
  }

  /**
   * Resolves the regular-season win pct per team for a season, used to feed the
   * prediction model. Resolution order:
   *   1. An explicitly injected, non-empty `deps.winPct` (preserves existing
   *      test-injection behavior).
   *   2. The DynamoDB standings cache (hit).
   *   3. A live standings fetch, aggregated via {@link winPctFromStandings} and
   *      written back to the cache.
   *
   * ANY failure in steps 2-3 (network, non-200, parse) resolves to `{}` (the
   * neutral fallback that {@link predict} treats as 0.5 per team) and NEVER
   * throws, so a prediction is always produced.
   */
  private async resolveWinPct(season: number): Promise<WinPctMap> {
    if (Object.keys(this.winPct).length > 0) {
      return this.winPct;
    }

    try {
      const cached = await this.store.getCachedStandings(season);
      if (cached) {
        return cached;
      }
      const response = await this.fetchStandings(season);
      const winPct = winPctFromStandings(response);
      await this.store.putCachedStandings(season, winPct);
      return winPct;
    } catch {
      return {};
    }
  }

  /**
   * Returns the bracket for a season. Resolution order:
   *   1. DynamoDB cache (hit).
   *   2. Live MLB Stats API fetch + aggregate + cache.
   *   3. On MLB failure, the bundled seed when one exists for the season
   *      (currently 2024 and 2025), else rethrow.
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
      // No seed for this season: rethrow so the handler surfaces the failure
      // (HTTP 500) rather than inventing data. Reachable seasons all have a
      // seed - SELECTABLE_SEASONS is [2026, 2025, 2024] and getSeedBracket
      // serves 2024 and 2025, with 2026 being live. A future results-only
      // season (e.g. 2027) is NOT offered by the selector; if one is ever
      // added it must ship a seed alongside it so this path still degrades.
      throw error;
    }
  }

  /**
   * Resolves a series and returns a prediction response.
   *
   * The response is a discriminated union (see {@link PredictionResponse}):
   *   - `mode: 'results'`  for a completed, results-only season (season <
   *     CURRENT_YEAR). This short-circuits BEFORE loading the bracket, running
   *     the prediction model, or invoking Bedrock - final results are shown
   *     instead of a prediction.
   *   - `mode: 'upcoming'` for the current, predictable season when the series
   *     is not resolvable yet (empty/placeholder-only bracket) or has not
   *     started (status 'scheduled'). This degrades gracefully instead of
   *     erroring, so an empty 2026 bracket never produces a 500.
   *   - `mode: 'results'` (series-level) for a resolved series whose
   *     `status === 'final'`, even in the current predictable season: a
   *     finished series has no prediction, so this also short-circuits BEFORE
   *     the predict model or Bedrock.
   *   - `mode: 'prediction'` for a resolvable, started, non-final series in the
   *     current season: the full numeric prediction with a Bedrock narrative.
   *     The optional `accuracy` (a sharpness control in [0, 1], default 0.5) is
   *     threaded to {@link predict}.
   */
  async getPrediction(
    seriesId: string,
    season: number,
    accuracy?: number,
    language?: NarrativeLanguage,
    model?: string,
  ): Promise<PredictionResponse> {
    // Results-only seasons short-circuit without touching the predict model or
    // the Bedrock invoker.
    if (isResultsOnly(season)) {
      return {
        mode: 'results',
        seriesId,
        season,
        message: `The ${season} postseason is complete; final results are shown instead of a prediction.`,
      };
    }

    const bracket = await this.getBracket(season);
    const series = resolveSeries(bracket, seriesId);

    // Series-level final gating: a finished series has no prediction, even in
    // the current predictable season. Return the results/no-prediction contract
    // WITHOUT running the predict model or invoking Bedrock. This is finer
    // grained than the season-level short-circuit above (which only fires for a
    // results-only season).
    if (series && series.status === 'final') {
      return {
        mode: 'results',
        seriesId,
        season,
        message: `This ${season} series is complete; final results are shown instead of a prediction.`,
      };
    }

    // Predictable season but the series is not yet resolvable (empty or
    // placeholder-only bracket) or has not started: no prediction available yet.
    // A series has "not started" when it is scheduled OR has no decided game
    // (the live MLB API lists not-yet-played games as "Preview" entries with
    // null scores/winners). The aggregator already classifies a preview-only
    // series as 'scheduled', and this guard double-checks the decided-game
    // condition so a preview-only series is never predicted on placeholder ids.
    if (!series || !hasStartedSeries(series)) {
      return {
        mode: 'upcoming',
        seriesId,
        season,
        message: `No prediction is available yet for this ${season} series; it has not started.`,
      };
    }

    // Resolve the requested model against the shared allowlist (unknown/missing
    // falls back to the default), default the language server-side, and resolve
    // the accuracy to the model default used by predict() so the cache key is
    // stable (an undefined accuracy and an explicit 0.5 map to the same key).
    const resolvedModel = resolveModelId(model);
    const resolvedLanguage = language ?? DEFAULT_NARRATIVE_LANGUAGE;
    const resolvedAccuracy = accuracy ?? DEFAULT_ACCURACY;

    // Build the cache key from the resolved values and the current series
    // situation. A game result update (a change in high.wins/low.wins) yields a
    // different key, which effectively invalidates the cache (criterion 2).
    const cacheKey = predictionCacheKey({
      seriesId,
      highWins: series.high.wins,
      lowWins: series.low.wins,
      language: resolvedLanguage,
      modelId: resolvedModel,
      accuracy: resolvedAccuracy,
    });

    // Cache hit: serve the cached prediction WITHOUT running predict() or
    // invoking Bedrock (criterion 1). No Bedrock InvokeModel attempt is made.
    const cached = await this.store.getCachedPrediction(cacheKey);
    if (cached) {
      emitCacheMetric({ cacheResult: 'hit', bedrockInvocations: 0, seriesId });
      return cached;
    }

    // Cache miss: run the billable path. generateNarrative is the single
    // Bedrock InvokeModel attempt (it falls back deterministically on error but
    // still counts as one attempt).
    emitCacheMetric({ cacheResult: 'miss', bedrockInvocations: 1, seriesId });

    const winPct = await this.resolveWinPct(season);
    const result = predict(series, bracket, winPct, accuracy);
    const { narrative, model: usedModel } = await generateNarrative(
      series,
      result,
      this.bedrockInvoker,
      resolvedModel,
      resolvedLanguage,
    );

    // The underdog is the series team (high/low) that is NOT the favorite.
    const underdogId =
      result.favoriteTeamId === series.high.teamId
        ? series.low.teamId
        : series.high.teamId;

    const response: PredictionResponse = {
      mode: 'prediction',
      seriesId,
      favoriteTeamId: result.favoriteTeamId,
      favoriteWinProbability: result.favoriteWinProbability,
      narrative,
      model: usedModel,
      generatedAt: new Date().toISOString(),
      metrics: {
        favorite: teamMetric(winPct, result.favoriteTeamId),
        underdog: teamMetric(winPct, underdogId),
      },
    };

    await this.store.putCachedPrediction(cacheKey, response);
    return response;
  }

  /**
   * Resolves a single series together with the bracket it belongs to, for the
   * share/OG endpoints. Reuses the cache-first {@link getBracket} path (MLB
   * fetch + seed fallback) and the tolerant {@link resolveSeries} lookup, so a
   * high/low-ordering mismatch across the seed/live boundary still resolves.
   * Returns `undefined` when the series id does not resolve to a series, which
   * the handlers surface as a 404.
   */
  async getSeriesWithBracket(
    seriesId: string,
    season: number,
  ): Promise<{ bracket: Bracket; series: Series } | undefined> {
    const bracket = await this.getBracket(season);
    const series = resolveSeries(bracket, seriesId);
    if (!series) {
      return undefined;
    }
    return { bracket, series };
  }

  /**
   * Returns the per-game detail (inning-by-inning line score, totals, pitcher
   * decisions, venue/state, optional recap highlight) for a game. Resolution:
   *   1. DynamoDB cache (hit) - RETURNS WITHOUT FETCHING (Issue #19 criterion 1).
   *   2. On a miss, fetch the linescore + feed/live in parallel, parse them with
   *      the pure parsers, best-effort fetch+parse the content highlight (a
   *      content failure NEVER fails the overall call), and assemble the `ok`
   *      response.
   *   3. Write the result back with a TTL chosen by game state: a completed game
   *      uses the LONG TTL, anything else the SHORT (live) TTL (criterion 1).
   *   4. On ANY linescore/feed-live upstream failure, RETURN the documented
   *      `{ status: 'unavailable', gamePk }` fallback WITHOUT throwing and
   *      WITHOUT caching it, so the frontend can fall back to the final score
   *      (criterion 2).
   */
  async getGameDetail(gamePk: number): Promise<GameDetailResponse> {
    const cached = await this.store.getCachedGameDetail(gamePk);
    if (cached) {
      return cached;
    }

    let detail: GameDetailResponse;
    try {
      const [rawLinescore, rawFeedLive] = await Promise.all([
        this.fetchGameLinescore(gamePk),
        this.fetchGameFeedLive(gamePk),
      ]);
      const linescore = parseLinescore(rawLinescore);
      const meta = parseGameMeta(rawFeedLive);

      // Best-effort recap highlight: a content fetch/parse failure must still
      // yield an `ok` response without a highlight (never fail the whole call).
      let highlight;
      try {
        const rawContent = await this.fetchGameContent(gamePk);
        highlight = parseHighlight(rawContent);
      } catch {
        highlight = undefined;
      }

      detail = buildGameDetail(gamePk, linescore, meta, highlight);
    } catch {
      // Upstream linescore/feed-live failure: documented fallback, not cached.
      return { status: 'unavailable', gamePk };
    }

    const ttlSeconds =
      detail.status === 'ok' && isCompletedGameState(detail.gameState)
        ? GAME_DETAIL_FINAL_TTL_SECONDS
        : GAME_DETAIL_LIVE_TTL_SECONDS;
    await this.store.putCachedGameDetail(detail, ttlSeconds);

    return detail;
  }
}
