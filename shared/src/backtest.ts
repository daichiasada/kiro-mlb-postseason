/**
 * Pure, deterministic backtest engine for the prediction model.
 *
 * This module replays the bundled seed brackets (POSTSEASON_2024 /
 * POSTSEASON_2025) through the pure {@link predict} function and scores how
 * well the model's favorite probability matched the eventual series winner.
 *
 * It imports ONLY pure shared code (`./predict.js`, `./types.js`) and the
 * bundled seed JSON (`./seed/index.js`). It structurally cannot reach AWS,
 * Bedrock, DynamoDB, or the network, which satisfies Issue #16 criterion (3):
 * the backtest never calls Bedrock.
 *
 * Semantics — "predict at the end of game k":
 *   For a given FINAL series with N games (sorted by `seriesGameNumber`
 *   ascending), for each k in 1..N we build a PARTIAL series whose `games` are
 *   the first k games and whose `high.wins`/`low.wins` are RECOMPUTED by
 *   counting winners among those first k games (we do NOT trust the series'
 *   stored final win counts). The partial status is `in_progress` when
 *   k < N else `final`. We call `predict(partial, bracket, {}, accuracy)` and
 *   compare its favorite against the EVENTUAL SERIES WINNER (the side with the
 *   greater final win total; a decided best-of series cannot tie).
 */
import { predict } from './predict.js';
import type { Bracket, GameResult, RoundName, Series } from './types.js';
import { POSTSEASON_2024, POSTSEASON_2025 } from './seed/index.js';

/** One scored prediction snapshot taken at the end of a single game. */
export interface BacktestSample {
  /** The series this sample belongs to. */
  seriesId: string;
  /** The round of the series (for grouping / display). */
  round: RoundName;
  /** The game number (k) at which the prediction was taken (1-based). */
  gameNumber: number;
  /** The team the model favored at this snapshot. */
  favoriteTeamId: number;
  /** The model's favorite win probability at this snapshot, in [0.5, 0.95]. */
  favoriteWinProbability: number;
  /** The team that eventually won the full series. */
  eventualWinnerTeamId: number;
  /** True when the favored team is the eventual series winner. */
  favoriteWasCorrect: boolean;
  /**
   * The probability the model implicitly assigned to the eventual winner:
   * `favoriteWinProbability` when the favorite won, else `1 - favoriteWinProbability`.
   */
  probOfEventualWinner: number;
}

/**
 * One calibration bucket over the FAVORITE probability range [0.5, 0.95]. Bins
 * are left-inclusive / right-exclusive, except the final bin which is
 * right-inclusive so that 0.95 (the model's clamp ceiling) lands in it.
 */
export interface CalibrationBin {
  /** Inclusive lower edge of the bucket. */
  lowerInclusive: number;
  /** Upper edge of the bucket (exclusive, except the last bin which is inclusive). */
  upperExclusive: number;
  /** Number of samples whose favoriteWinProbability fell in this bucket. */
  predictedCount: number;
  /** Mean favoriteWinProbability of samples in this bucket, or null when empty. */
  meanPredictedProbability: number | null;
  /** Fraction of samples in this bucket where the favorite was correct, or null when empty. */
  empiricalWinRate: number | null;
}

/** Aggregated backtest metrics for a single bracket (season) at one accuracy. */
export interface BacktestResult {
  /** The accuracy the model was run at. */
  accuracy: number;
  /** Total number of scored samples (one per game across all final series). */
  sampleCount: number;
  /** Fraction of samples where the favorite was the eventual winner, in [0, 1]. */
  hitRate: number;
  /** Mean squared error of the probability assigned to the eventual winner, in [0, 1]. */
  brierScore: number;
  /** Fixed calibration buckets over the favorite probability range [0.5, 0.95]. */
  calibrationBins: CalibrationBin[];
}

/** Multi-season backtest with per-season results and a pooled combined result. */
export interface MultiSeasonBacktest {
  accuracy: number;
  seasons: number[];
  perSeason: Record<number, BacktestResult>;
  /** Metrics recomputed over the POOLED samples of all seasons (not an average). */
  combined: BacktestResult;
}

/** Fixed calibration bucket edges over the model's output range [0.5, 0.95]. */
const CALIBRATION_EDGES = [0.5, 0.6, 0.7, 0.8, 0.9, 0.95] as const;

/** Rounding precision for stable, pinnable metric literals. */
const METRIC_PRECISION = 6;

/** Round to {@link METRIC_PRECISION} decimals so expected test values are stable. */
function roundMetric(value: number): number {
  return Number(value.toFixed(METRIC_PRECISION));
}

/** Count the games in `games` won by `teamId` (per-side `isWinner` flags). */
function countWins(games: GameResult[], teamId: number): number {
  let wins = 0;
  for (const game of games) {
    if (game.home.teamId === teamId && game.home.isWinner === true) {
      wins += 1;
    } else if (game.away.teamId === teamId && game.away.isWinner === true) {
      wins += 1;
    }
  }
  return wins;
}

/**
 * Build the per-game samples for a single FINAL series. Returns an empty array
 * for series that are not final or have no games.
 */
function sampleSeries(series: Series, bracket: Bracket, accuracy: number): BacktestSample[] {
  if (series.status !== 'final' || series.games.length === 0) {
    return [];
  }

  const games = [...series.games].sort((a, b) => a.seriesGameNumber - b.seriesGameNumber);
  const highId = series.high.teamId;
  const lowId = series.low.teamId;

  // Eventual series winner = the side with the greater FINAL win total across
  // all games. A decided best-of series cannot tie.
  const highFinalWins = countWins(games, highId);
  const lowFinalWins = countWins(games, lowId);
  const eventualWinnerTeamId = highFinalWins >= lowFinalWins ? highId : lowId;

  const samples: BacktestSample[] = [];
  for (let k = 1; k <= games.length; k += 1) {
    const partialGames = games.slice(0, k);
    const partial: Series = {
      ...series,
      high: { teamId: highId, wins: countWins(partialGames, highId) },
      low: { teamId: lowId, wins: countWins(partialGames, lowId) },
      status: k < games.length ? 'in_progress' : 'final',
      games: partialGames,
    };

    const { favoriteTeamId, favoriteWinProbability } = predict(partial, bracket, {}, accuracy);
    const favoriteWasCorrect = favoriteTeamId === eventualWinnerTeamId;
    const probOfEventualWinner = favoriteWasCorrect
      ? favoriteWinProbability
      : 1 - favoriteWinProbability;

    samples.push({
      seriesId: series.id,
      round: series.round,
      gameNumber: partialGames[partialGames.length - 1]!.seriesGameNumber,
      favoriteTeamId,
      favoriteWinProbability,
      eventualWinnerTeamId,
      favoriteWasCorrect,
      probOfEventualWinner,
    });
  }

  return samples;
}

/** Assign a favorite probability to its calibration bucket index. */
function binIndexFor(probability: number): number {
  for (let i = 0; i < CALIBRATION_EDGES.length - 1; i += 1) {
    const lower = CALIBRATION_EDGES[i]!;
    const upper = CALIBRATION_EDGES[i + 1]!;
    const isLast = i === CALIBRATION_EDGES.length - 2;
    if (probability >= lower && (probability < upper || (isLast && probability <= upper))) {
      return i;
    }
  }
  // Values below the first edge (should not happen given the [0.5, 0.95] clamp)
  // fall into the first bucket; values above the last edge fall into the last.
  return probability < CALIBRATION_EDGES[0]! ? 0 : CALIBRATION_EDGES.length - 2;
}

/** Build the fixed calibration bins from a set of samples. */
function buildCalibrationBins(samples: BacktestSample[]): CalibrationBin[] {
  const binCount = CALIBRATION_EDGES.length - 1;
  const sums = Array.from({ length: binCount }, () => ({ count: 0, probSum: 0, correct: 0 }));

  for (const sample of samples) {
    const index = binIndexFor(sample.favoriteWinProbability);
    const bucket = sums[index]!;
    bucket.count += 1;
    bucket.probSum += sample.favoriteWinProbability;
    if (sample.favoriteWasCorrect) {
      bucket.correct += 1;
    }
  }

  return sums.map((bucket, i) => ({
    lowerInclusive: CALIBRATION_EDGES[i]!,
    upperExclusive: CALIBRATION_EDGES[i + 1]!,
    predictedCount: bucket.count,
    meanPredictedProbability: bucket.count > 0 ? roundMetric(bucket.probSum / bucket.count) : null,
    empiricalWinRate: bucket.count > 0 ? roundMetric(bucket.correct / bucket.count) : null,
  }));
}

/** Aggregate a set of samples into a {@link BacktestResult} at a given accuracy. */
function aggregate(samples: BacktestSample[], accuracy: number): BacktestResult {
  const sampleCount = samples.length;

  if (sampleCount === 0) {
    // Empty-case contract: no samples => zero metrics (not NaN), empty bins.
    return {
      accuracy,
      sampleCount: 0,
      hitRate: 0,
      brierScore: 0,
      calibrationBins: buildCalibrationBins(samples),
    };
  }

  let hits = 0;
  let squaredErrorSum = 0;
  for (const sample of samples) {
    if (sample.favoriteWasCorrect) {
      hits += 1;
    }
    const error = sample.probOfEventualWinner - 1;
    squaredErrorSum += error * error;
  }

  return {
    accuracy,
    sampleCount,
    hitRate: roundMetric(hits / sampleCount),
    brierScore: roundMetric(squaredErrorSum / sampleCount),
    calibrationBins: buildCalibrationBins(samples),
  };
}

/** Collect all scored samples across the final series of a bracket. */
function collectSamples(bracket: Bracket, accuracy: number): BacktestSample[] {
  const samples: BacktestSample[] = [];
  for (const series of bracket.series) {
    samples.push(...sampleSeries(series, bracket, accuracy));
  }
  return samples;
}

/**
 * Backtest a single bracket at the given accuracy. Replays every final series
 * game-by-game and scores the favorite probability against the eventual winner.
 */
export function runBacktest(bracket: Bracket, accuracy: number): BacktestResult {
  return aggregate(collectSamples(bracket, accuracy), accuracy);
}

/** Resolve a season number to its bundled seed bracket. */
function seedBracketForSeason(season: number): Bracket | undefined {
  if (season === 2024) {
    return POSTSEASON_2024;
  }
  if (season === 2025) {
    return POSTSEASON_2025;
  }
  return undefined;
}

/**
 * Backtest across multiple seasons. `perSeason` holds one result per season;
 * `combined` recomputes all metrics over the POOLED samples of every season
 * (not by averaging per-season metrics).
 */
export function runMultiSeasonBacktest(
  accuracy: number,
  seasons: number[] = [2024, 2025],
): MultiSeasonBacktest {
  const perSeason: Record<number, BacktestResult> = {};
  const pooled: BacktestSample[] = [];

  for (const season of seasons) {
    const bracket = seedBracketForSeason(season);
    if (!bracket) {
      perSeason[season] = aggregate([], accuracy);
      continue;
    }
    const samples = collectSamples(bracket, accuracy);
    perSeason[season] = aggregate(samples, accuracy);
    pooled.push(...samples);
  }

  return {
    accuracy,
    seasons: [...seasons],
    perSeason,
    combined: aggregate(pooled, accuracy),
  };
}

/** A single accuracy's multi-season backtest, flattened for slider comparison. */
export interface AccuracyBacktest {
  accuracy: number;
  combined: BacktestResult;
  perSeason: Record<number, BacktestResult>;
}

/**
 * Run {@link runMultiSeasonBacktest} across a set of accuracy values to support
 * the frontend's accuracy-slider comparison. Defaults to a representative sweep.
 */
export function runBacktestAcrossAccuracies(
  accuracies: number[] = [0, 0.25, 0.5, 0.75, 1],
  seasons?: number[],
): AccuracyBacktest[] {
  return accuracies.map((accuracy) => {
    const multi = runMultiSeasonBacktest(accuracy, seasons);
    return { accuracy, combined: multi.combined, perSeason: multi.perSeason };
  });
}
