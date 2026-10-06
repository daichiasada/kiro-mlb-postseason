/**
 * Pure, React-free data helpers for the series-flow visualization (Issue #24).
 *
 * These turn a {@link Series} (and, for predictable seasons, the pure
 * {@link predict} via the shared backtest truncation) into the plain data
 * arrays the SVG charts and their tabular fallbacks render from. They are
 * dependency-free and side-effect-free so they can be unit-tested with injected
 * fixtures, mirroring the style of {@link ./gameTime} and {@link ./upcomingGames}.
 *
 * The win-probability trend deliberately does NOT reimplement the per-game
 * truncation: it delegates to {@link seriesProbTrend} in `@mlb/shared`
 * (backtest.ts), keeping the pure `predict()` the single source of truth for
 * every probability and the slice/recompute-wins logic in exactly one place.
 */
import type { Bracket, Series } from '@mlb/shared';
import { seriesProbTrend } from '@mlb/shared';

/** Per-game score margin, with the winning side resolved from `isWinner`. */
export interface SeriesScoreDiff {
  /** The game's series game number (1-based). */
  gameNumber: number;
  /** The away team's id. */
  awayTeamId: number;
  /** The home team's id. */
  homeTeamId: number;
  /** The away team's score, or null when the game has no recorded score. */
  awayScore: number | null;
  /** The home team's score, or null when the game has no recorded score. */
  homeScore: number | null;
  /**
   * The id of the game's winner (the side whose `isWinner` is true), or null
   * when neither side is marked a winner (e.g. an in-progress game).
   */
  winnerTeamId: number | null;
  /**
   * The absolute score margin `|awayScore - homeScore|`, or 0 when either
   * score is null (an unplayed / in-progress game has no meaningful margin).
   */
  diff: number;
}

/** Running series-win totals after each played game. */
export interface CumulativeWinPoint {
  /** The game number (1-based) this running total is taken after. */
  gameNumber: number;
  /** Games won by `series.high.teamId` among games 1..gameNumber. */
  highWins: number;
  /** Games won by `series.low.teamId` among games 1..gameNumber. */
  lowWins: number;
}

/** Per-game favorite win probability snapshot (re-exported shape). */
export interface WinProbPoint {
  /** The game number (1-based) the probability was taken after. */
  gameNumber: number;
  /** The team the model favored at this snapshot. */
  favoriteTeamId: number;
  /** The model's favorite win probability at this snapshot, in [0.5, 0.95]. */
  favoriteWinProbability: number;
}

/** Return a copy of `series.games` sorted by `seriesGameNumber` ascending. */
function gamesInOrder(series: Series) {
  return [...series.games].sort((a, b) => a.seriesGameNumber - b.seriesGameNumber);
}

/**
 * Per-game score margins for a series, in series-game-number order.
 *
 * The winner is resolved from each side's `isWinner` flag (null when neither
 * side is a winner). The `diff` is the absolute score margin, falling back to 0
 * when either score is null so unplayed / in-progress games render flat rather
 * than throwing.
 */
export function seriesScoreDiffs(series: Series): SeriesScoreDiff[] {
  return gamesInOrder(series).map((game) => {
    const { away, home } = game;
    const bothScored = away.score !== null && home.score !== null;
    const diff = bothScored ? Math.abs(away.score! - home.score!) : 0;

    let winnerTeamId: number | null = null;
    if (away.isWinner === true) {
      winnerTeamId = away.teamId;
    } else if (home.isWinner === true) {
      winnerTeamId = home.teamId;
    }

    return {
      gameNumber: game.seriesGameNumber,
      awayTeamId: away.teamId,
      homeTeamId: home.teamId,
      awayScore: away.score,
      homeScore: home.score,
      winnerTeamId,
      diff,
    };
  });
}

/**
 * Running series-win totals for the high and low seeds after each game.
 *
 * Wins are recomputed by counting `isWinner` among games 1..k for each side;
 * the series' stored final win counts are intentionally NOT trusted (same
 * counting semantics as backtest.ts `countWins`). The first entry is after
 * game 1; a series with no games yields an empty array.
 */
export function cumulativeWinTrend(series: Series): CumulativeWinPoint[] {
  const highId = series.high.teamId;
  const lowId = series.low.teamId;

  let highWins = 0;
  let lowWins = 0;

  return gamesInOrder(series).map((game) => {
    if (game.home.teamId === highId && game.home.isWinner === true) {
      highWins += 1;
    } else if (game.away.teamId === highId && game.away.isWinner === true) {
      highWins += 1;
    }
    if (game.home.teamId === lowId && game.home.isWinner === true) {
      lowWins += 1;
    } else if (game.away.teamId === lowId && game.away.isWinner === true) {
      lowWins += 1;
    }

    return { gameNumber: game.seriesGameNumber, highWins, lowWins };
  });
}

/**
 * Per-game favorite win probability for a series, using the pure prediction
 * model at the given `accuracy`.
 *
 * This delegates entirely to the shared {@link seriesProbTrend}, which owns the
 * per-game truncation (slice to the first k games, recompute high/low wins,
 * call `predict`). We never recompute win counts or call `predict` here, so the
 * truncation lives in one place and `predict()` stays the single probability
 * source. Returns an empty array for a series with no games.
 */
export function winProbTrend(
  series: Series,
  bracket: Bracket,
  accuracy: number,
): WinProbPoint[] {
  return seriesProbTrend(series, bracket, accuracy);
}
