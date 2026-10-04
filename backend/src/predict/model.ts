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

/** Supported range and default for the accuracy (sharpness) control. */
export const MIN_ACCURACY = 0;
export const MAX_ACCURACY = 1;
/**
 * Default accuracy. Chosen so the default reproduces the model's historical
 * behavior exactly: the sharpening factor is `2 * accuracy`, which equals 1
 * (an identity transform on the favorite's share) at accuracy 0.5.
 */
export const DEFAULT_ACCURACY = 0.5;

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
 * The optional `accuracy` is a sharpness/temperature control in the range
 * [{@link MIN_ACCURACY}, {@link MAX_ACCURACY}] = [0, 1] (default
 * {@link DEFAULT_ACCURACY} = 0.5). It governs how aggressively the favorite's
 * raw blended score share is pushed toward the clamp bounds BEFORE the final
 * clamp to [{@link MIN_PROB}, {@link MAX_PROB}] = [0.5, 0.95]:
 *
 *   - The raw favorite share is first clamped to [0.5, 0.95] (p0), exactly as
 *     before.
 *   - A linear sharpening factor `f = 2 * accuracy` is applied around the
 *     conservative floor 0.5: `p = 0.5 + (p0 - 0.5) * f`.
 *   - `p` is clamped again to [0.5, 0.95] and rounded to 4 decimals.
 *
 * Consequences:
 *   - accuracy = 0.5 (default) => f = 1 => identity, reproducing the model's
 *     historical output exactly (a regression guard pins this).
 *   - accuracy > 0.5 => f > 1 => the favorite's probability is pushed harder
 *     toward 0.95 (more confident / aggressive).
 *   - accuracy < 0.5 => f < 1 => the probability is softened toward 0.5 (more
 *     conservative); accuracy = 0 collapses it to exactly 0.5.
 *
 * The transform is monotonic non-decreasing in accuracy for a given favored
 * series, keeps the probability within [0.5, 0.95] for every accuracy, does
 * not change which team is the favorite, and stays deterministic. Out-of-range
 * accuracy inputs are clamped to [0, 1].
 *
 * @param series   The series to evaluate.
 * @param _bracket The full bracket (reserved for future cross-series signals).
 * @param winPct   Optional regular-season win pct per team id.
 * @param accuracy Optional sharpness control in [0, 1] (default 0.5).
 */
export function predict(
  series: Series,
  _bracket: Bracket,
  winPct: WinPctMap = {},
  accuracy: number = DEFAULT_ACCURACY,
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

  // Clamp the raw share first (p0), then apply the accuracy sharpening around
  // the conservative floor, and clamp again. A non-finite accuracy falls back
  // to the default; otherwise it is clamped into the supported range.
  const safeAccuracy = Number.isFinite(accuracy)
    ? clamp(accuracy, MIN_ACCURACY, MAX_ACCURACY)
    : DEFAULT_ACCURACY;
  const p0 = clamp(favoriteShare, MIN_PROB, MAX_PROB);
  const sharpenFactor = 2 * safeAccuracy;
  const sharpened = MIN_PROB + (p0 - MIN_PROB) * sharpenFactor;

  const favoriteWinProbability = Number(clamp(sharpened, MIN_PROB, MAX_PROB).toFixed(4));

  return { favoriteTeamId, favoriteWinProbability };
}

/** Convenience: resolve a team's display name for narrative building. */
export function teamName(teamId: number): string {
  return TEAMS[teamId]?.name ?? `Team ${teamId}`;
}
