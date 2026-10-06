/**
 * Shared bounds for the prediction-accuracy (sharpness) control.
 *
 * These numeric values are a domain contract shared across the boundary: the
 * backend prediction model clamps the `accuracy` argument into this range, and
 * the frontend slider offers exactly this range/step/default. Keeping them in
 * `@mlb/shared` (where domain types already live) means a future change to the
 * supported range cannot silently desynchronize the model from the UI.
 */

/** Minimum supported accuracy (collapses the prediction toward a coin flip). */
export const MIN_ACCURACY = 0;

/** Maximum supported accuracy (sharpens the prediction toward the favorite). */
export const MAX_ACCURACY = 1;

/**
 * Default accuracy. Chosen so the default reproduces the model's historical
 * behavior exactly: the sharpening factor is `2 * accuracy`, which equals 1
 * (an identity transform on the favorite's share) at accuracy 0.5.
 */
export const DEFAULT_ACCURACY = 0.5;

/** Step size for the frontend accuracy slider across [0, 1]. */
export const ACCURACY_STEP = 0.05;
