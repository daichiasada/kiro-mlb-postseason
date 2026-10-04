/**
 * Transparent, deterministic win/loss prediction model.
 *
 * The heuristic combines two signals:
 *   1. Current series progress (games already won toward the clinch count).
 *   2. Regular-season strength (win pct, when known; neutral 0.5 otherwise).
 *
 * It is a pure function so it can be unit-tested without any network or AWS.
 */
import { TEAMS, type Bracket, type Series } from '@mlb/shared';

export interface PredictionResult {
  favoriteTeamId: number;
  favoriteWinProbability: number;
}

/** Clamp bounds for the favorite's probability. */
const MIN_PROB = 0.5;
const MAX_PROB = 0.95;

/**
 * Optional regular-season win percentages keyed by team id. When a team is not
 * present the model treats it as a neutral 0.5. This keeps the model usable
 * with only series data while allowing richer inputs later.
 */
export type WinPctMap = Record<number, number>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Predicts the favorite of a series and its win probability.
 *
 * @param series   The series to evaluate.
 * @param _bracket The full bracket (reserved for future cross-series signals).
 * @param winPct   Optional regular-season win pct per team id.
 */
export function predict(
  series: Series,
  _bracket: Bracket,
  winPct: WinPctMap = {},
): PredictionResult {
  const clinch = Math.ceil(series.bestOf / 2);

  const highId = series.high.teamId;
  const lowId = series.low.teamId;

  // Series-progress signal in [0, 1]: how far each team is toward clinching.
  const highProgress = clinch > 0 ? series.high.wins / clinch : 0;
  const lowProgress = clinch > 0 ? series.low.wins / clinch : 0;

  // Regular-season strength signal, defaulting to neutral when unknown.
  const highStrength = winPct[highId] ?? 0.5;
  const lowStrength = winPct[lowId] ?? 0.5;

  // Add a small home-field edge to the high seed as a tie-breaker.
  const HOME_FIELD_EDGE = 0.02;

  // Blend progress (weighted heavier because it reflects live results) with
  // regular-season strength to produce a raw score per team.
  const PROGRESS_WEIGHT = 0.7;
  const STRENGTH_WEIGHT = 0.3;

  const highScore =
    PROGRESS_WEIGHT * highProgress + STRENGTH_WEIGHT * highStrength + HOME_FIELD_EDGE;
  const lowScore = PROGRESS_WEIGHT * lowProgress + STRENGTH_WEIGHT * lowStrength;

  const total = highScore + lowScore;

  // Determine favorite and its share of the combined score.
  let favoriteTeamId: number;
  let favoriteShare: number;
  if (highScore >= lowScore) {
    favoriteTeamId = highId;
    favoriteShare = total > 0 ? highScore / total : 0.5;
  } else {
    favoriteTeamId = lowId;
    favoriteShare = total > 0 ? lowScore / total : 0.5;
  }

  const favoriteWinProbability = Number(clamp(favoriteShare, MIN_PROB, MAX_PROB).toFixed(4));

  return { favoriteTeamId, favoriteWinProbability };
}

/** Convenience: resolve a team's display name for narrative building. */
export function teamName(teamId: number): string {
  return TEAMS[teamId]?.name ?? `Team ${teamId}`;
}
