/**
 * Thin client for the public MLB Stats API postseason schedule endpoint.
 *
 * Uses the global `fetch` available in the Node 20 Lambda runtime, so there is
 * no `node-fetch` dependency. The response is narrowed to the subset of fields
 * the aggregator consumes.
 */

/** One side (away/home) of a raw MLB Stats API game. */
export interface RawTeamSide {
  team: { id: number; name: string };
  leagueRecord?: { wins: number; losses: number; pct: string };
  score?: number;
  isWinner?: boolean;
}

/** A single raw game from the MLB Stats API schedule response. */
export interface RawGame {
  gamePk: number;
  gameDate: string;
  seriesDescription: string;
  seriesGameNumber: number;
  gamesInSeries: number;
  status?: { abstractGameState?: string };
  teams: {
    away: RawTeamSide;
    home: RawTeamSide;
  };
}

interface RawScheduleResponse {
  dates?: Array<{ games?: RawGame[] }>;
}

/** Error thrown when the MLB Stats API responds with a non-success status. */
export class MlbApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'MlbApiError';
    this.status = status;
  }
}

const BASE_URL = 'https://statsapi.mlb.com/api/v1/schedule/postseason';

/**
 * Fetches the full postseason schedule for a season and returns the flat list
 * of games across every date. Throws {@link MlbApiError} on a non-200 response.
 */
export async function fetchPostseasonSchedule(season: number): Promise<RawGame[]> {
  const url = `${BASE_URL}?sportId=1&season=${season}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new MlbApiError(
      response.status,
      `MLB Stats API request failed with status ${response.status}`,
    );
  }

  const body = (await response.json()) as RawScheduleResponse;
  const dates = body.dates ?? [];
  return dates.flatMap((date) => date.games ?? []);
}
