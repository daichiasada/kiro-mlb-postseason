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
  date: string;
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
}

/** Request payload for the win/loss prediction endpoint. */
export interface PredictionRequest {
  seriesId: string;
}

/** AI-generated prediction for a single series. */
export interface Prediction {
  seriesId: string;
  favoriteTeamId: number;
  favoriteWinProbability: number;
  narrative: string;
  model: string;
  generatedAt: string;
}

/**
 * Teams appearing in the 2024 MLB postseason, keyed by MLB Stats API team id.
 * Ids and names are sourced from https://statsapi.mlb.com/api/v1/schedule/postseason.
 */
export const TEAMS: Record<number, Team> = {
  110: { id: 110, name: 'Baltimore Orioles', abbreviation: 'BAL', league: 'AL' },
  114: { id: 114, name: 'Cleveland Guardians', abbreviation: 'CLE', league: 'AL' },
  116: { id: 116, name: 'Detroit Tigers', abbreviation: 'DET', league: 'AL' },
  117: { id: 117, name: 'Houston Astros', abbreviation: 'HOU', league: 'AL' },
  118: { id: 118, name: 'Kansas City Royals', abbreviation: 'KC', league: 'AL' },
  119: { id: 119, name: 'Los Angeles Dodgers', abbreviation: 'LAD', league: 'NL' },
  121: { id: 121, name: 'New York Mets', abbreviation: 'NYM', league: 'NL' },
  135: { id: 135, name: 'San Diego Padres', abbreviation: 'SD', league: 'NL' },
  143: { id: 143, name: 'Philadelphia Phillies', abbreviation: 'PHI', league: 'NL' },
  144: { id: 144, name: 'Atlanta Braves', abbreviation: 'ATL', league: 'NL' },
  147: { id: 147, name: 'New York Yankees', abbreviation: 'NYY', league: 'AL' },
  158: { id: 158, name: 'Milwaukee Brewers', abbreviation: 'MIL', league: 'NL' },
};
