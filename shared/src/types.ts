/**
 * Shared domain types for the MLB postseason summary site.
 *
 * These types are consumed by both the backend (Lambda handlers, MLB Stats API
 * aggregation, Bedrock prediction) and the frontend (React components). They are
 * the single source of truth for the shape of data that crosses the API boundary.
 */

export type League = 'AL' | 'NL';

export type RoundName =
  | 'Wild Card'
  | 'Division Series'
  | 'Championship Series'
  | 'World Series';

/** A single MLB team as it appears in the postseason dataset. */
export interface Team {
  id: number;
  name: string;
  abbreviation?: string;
  league: League;
}

/** One team's result within a single game. */
export interface TeamSideResult {
  teamId: number;
  score: number | null;
  isWinner: boolean | null;
}

/** The result of a single postseason game. */
export interface GameResult {
  gamePk: number;
  /**
   * The game's calendar date in date-only `YYYY-MM-DD` form. This stays
   * date-only for backward compatibility: existing producers, the bundled seed
   * datasets, and any consumer that reads only the date remain valid.
   */
  date: string;
  /**
   * Optional full ISO-8601 UTC datetime of first pitch (e.g.
   * `2024-10-01T18:32:00Z`), copied verbatim from the MLB Stats API `gameDate`.
   * This preserves the start time that `date` truncates away. Omitted when the
   * start time is undetermined ({@link GameResult.timeTbd} is true) and absent
   * on older producers and the bundled seed datasets, hence optional.
   */
  startTime?: string;
  /**
   * Optional flag marking a start time that is not yet scheduled (TBD). True
   * when the MLB Stats API reports `status.startTimeTBD` or supplies only a
   * date-only midnight placeholder for a not-yet-scheduled game; in that case
   * {@link GameResult.startTime} is omitted so the UI can render a localized
   * "Time TBD" rather than a bogus midnight. Absent on older producers and the
   * bundled seed datasets, hence optional.
   */
  timeTbd?: boolean;
  away: TeamSideResult;
  home: TeamSideResult;
  seriesGameNumber: number;
}

/** A team's standing within a series (higher/lower seed), with current win count. */
export interface SeriesTeam {
  teamId: number;
  wins: number;
}

export type SeriesStatus = 'scheduled' | 'in_progress' | 'final';

/** 'WS' is used for the World Series, which crosses both leagues. */
export type SeriesLeague = League | 'WS';

/** An aggregated postseason series (a set of games between two teams). */
export interface Series {
  id: string;
  round: RoundName;
  league: SeriesLeague;
  /** Higher seed (home-field advantage). */
  high: SeriesTeam;
  /** Lower seed. */
  low: SeriesTeam;
  bestOf: number;
  status: SeriesStatus;
  games: GameResult[];
}

/** The full postseason bracket for a given season. */
export interface Bracket {
  season: number;
  updatedAt: string;
  series: Series[];
  /**
   * Optional, non-blocking data-integrity warnings about finished contexts
   * that still reference a placeholder/TBD team (see `integrity.ts`). This is
   * populated by the bracket HANDLER, not by the pure aggregator or the seed
   * data, so it is optional and existing consumers that ignore it are
   * unaffected. See {@link import('./integrity.js').IntegrityWarning}.
   */
  integrityWarnings?: import('./integrity.js').IntegrityWarning[];
}

/** Request payload for the win/loss prediction endpoint. */
export interface PredictionRequest {
  seriesId: string;
}

/**
 * One team's regular-season win pct as fed into the prediction model. A `null`
 * `winPct` means the standings were unknown for that team and the neutral 0.5
 * fallback was used by the model.
 */
export interface TeamMetric {
  teamId: number;
  winPct: number | null;
}

/**
 * The regular-season metrics the prediction model used, split by role. This is
 * additive, explanatory metadata so the UI can show the basis of a prediction;
 * it never changes the numeric prediction itself.
 */
export interface PredictionMetrics {
  favorite: TeamMetric;
  underdog: TeamMetric;
}

/** AI-generated prediction for a single series. */
export interface Prediction {
  seriesId: string;
  favoriteTeamId: number;
  favoriteWinProbability: number;
  narrative: string;
  model: string;
  generatedAt: string;
  /**
   * Optional, additive regular-season metrics used by the model (favorite vs
   * underdog win pct). Omitted by older producers; present on mode:'prediction'
   * responses that resolved standings. Existing consumers and the
   * 'results'/'upcoming' variants are unaffected.
   */
  metrics?: PredictionMetrics;
}

/**
 * Response returned by the /prediction endpoint for a completed, results-only
 * season (any season before the current year). The frontend branches on `mode`
 * to show final results instead of a prediction, without ever invoking the
 * prediction model or Bedrock.
 */
export interface ResultsOnlyPrediction {
  mode: 'results';
  seriesId: string;
  season: number;
  message: string;
}

/**
 * Response returned by the /prediction endpoint for the current, predictable
 * season when the requested series is not yet started or otherwise not
 * resolvable to a live/in-progress matchup (e.g. an empty or placeholder-only
 * bracket). Lets the frontend show a graceful "no prediction yet" state rather
 * than treating it as an error.
 */
export interface UpcomingPrediction {
  mode: 'upcoming';
  seriesId: string;
  season: number;
  message: string;
}

/**
 * The full /prediction response contract. A successful numeric prediction is
 * tagged with `mode: 'prediction'`; the other variants cover the results-only
 * and upcoming cases. All three are returned with HTTP 200 so the frontend can
 * branch on `mode`.
 */
export type PredictionResponse =
  | (Prediction & { mode: 'prediction' })
  | ResultsOnlyPrediction
  | UpcomingPrediction;

/**
 * One side (away/home) of a single inning's or the game's run/hit/error line.
 * Each value is `null` when the MLB Stats API omits it (e.g. an inning not yet
 * played, or a missing field), so consumers can distinguish "0" from "unknown".
 */
export interface LineScoreSide {
  runs: number | null;
  hits: number | null;
  errors: number | null;
}

/** A single inning's line (away + home run/hit/error splits). */
export interface InningLine {
  /** 1-based inning number (MLB `innings[].num`). */
  inning: number;
  /** Optional ordinal label from the MLB API (e.g. "1st"); omitted when absent. */
  ordinal?: string;
  away: LineScoreSide;
  home: LineScoreSide;
}

/** The game totals row (away + home run/hit/error splits). */
export interface LineScoreTotals {
  away: LineScoreSide;
  home: LineScoreSide;
}

/**
 * The winning/losing/save pitcher decisions for a completed game. Each is the
 * pitcher's full name; all are optional because the MLB `liveData.decisions`
 * block is absent for games that have not finished, and `save` is frequently
 * absent even for finished games.
 */
export interface GamePitchers {
  winner?: string;
  loser?: string;
  save?: string;
}

/** An optional recap/highlight link for a game (from the MLB content endpoint). */
export interface GameHighlight {
  title: string;
  url: string;
}

/**
 * The per-game detail contract returned by the GET /game endpoint. A
 * discriminated union on `status`:
 *   - `status: 'ok'` carries the inning-by-inning line score, totals, pitcher
 *     decisions, the venue + game state, and an optional recap highlight.
 *   - `status: 'unavailable'` is the DOCUMENTED fallback returned (with HTTP
 *     200) when the upstream MLB linescore/feed-live fetch fails. The frontend
 *     branches on this to keep showing the already-known final score instead of
 *     surfacing an error. It is never cached.
 */
export type GameDetailResponse =
  | {
      status: 'ok';
      gamePk: number;
      /** MLB `abstractGameState` (e.g. "Final", "Live", "Preview"). */
      gameState: string;
      /** Venue name when available (MLB `gameData.venue.name`). */
      venue?: string;
      innings: InningLine[];
      totals: LineScoreTotals;
      pitchers: GamePitchers;
      highlight?: GameHighlight;
    }
  | {
      status: 'unavailable';
      gamePk: number;
    };

/**
 * Teams appearing in the 2024 and 2025 MLB postseasons, keyed by MLB Stats API
 * team id. Ids and names are sourced from
 * https://statsapi.mlb.com/api/v1/schedule/postseason.
 */
export const TEAMS: Record<number, Team> = {
  110: { id: 110, name: 'Baltimore Orioles', abbreviation: 'BAL', league: 'AL' },
  111: { id: 111, name: 'Boston Red Sox', abbreviation: 'BOS', league: 'AL' },
  112: { id: 112, name: 'Chicago Cubs', abbreviation: 'CHC', league: 'NL' },
  113: { id: 113, name: 'Cincinnati Reds', abbreviation: 'CIN', league: 'NL' },
  114: { id: 114, name: 'Cleveland Guardians', abbreviation: 'CLE', league: 'AL' },
  116: { id: 116, name: 'Detroit Tigers', abbreviation: 'DET', league: 'AL' },
  117: { id: 117, name: 'Houston Astros', abbreviation: 'HOU', league: 'AL' },
  118: { id: 118, name: 'Kansas City Royals', abbreviation: 'KC', league: 'AL' },
  119: { id: 119, name: 'Los Angeles Dodgers', abbreviation: 'LAD', league: 'NL' },
  121: { id: 121, name: 'New York Mets', abbreviation: 'NYM', league: 'NL' },
  135: { id: 135, name: 'San Diego Padres', abbreviation: 'SD', league: 'NL' },
  136: { id: 136, name: 'Seattle Mariners', abbreviation: 'SEA', league: 'AL' },
  139: { id: 139, name: 'Tampa Bay Rays', abbreviation: 'TB', league: 'AL' },
  141: { id: 141, name: 'Toronto Blue Jays', abbreviation: 'TOR', league: 'AL' },
  143: { id: 143, name: 'Philadelphia Phillies', abbreviation: 'PHI', league: 'NL' },
  144: { id: 144, name: 'Atlanta Braves', abbreviation: 'ATL', league: 'NL' },
  145: { id: 145, name: 'Chicago White Sox', abbreviation: 'CWS', league: 'AL' },
  147: { id: 147, name: 'New York Yankees', abbreviation: 'NYY', league: 'AL' },
  158: { id: 158, name: 'Milwaukee Brewers', abbreviation: 'MIL', league: 'NL' },
};
