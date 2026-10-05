import type { Bracket, RoundName, Series, SeriesLeague } from '@mlb/shared';

/** Rounds in postseason progression order. */
export const ROUND_ORDER: RoundName[] = [
  'Wild Card',
  'Division Series',
  'Championship Series',
  'World Series',
];

/**
 * Groups a bracket's series by round and league so the view can lay them out
 * in columns (round) and lanes (AL left, WS center, NL right).
 *
 * Returns rounds in {@link ROUND_ORDER}. Within each round, series are returned
 * sorted by league (AL, WS, NL) then by id for stable rendering.
 */
export interface RoundColumn {
  round: RoundName;
  series: Series[];
}

const LEAGUE_RANK: Record<SeriesLeague, number> = { AL: 0, WS: 1, NL: 2 };

export function buildRoundColumns(bracket: Bracket): RoundColumn[] {
  return ROUND_ORDER.map((round) => {
    const series = bracket.series
      .filter((s) => s.round === round)
      .sort((a, b) => {
        const byLeague = LEAGUE_RANK[a.league] - LEAGUE_RANK[b.league];
        return byLeague !== 0 ? byLeague : a.id.localeCompare(b.id);
      });
    return { round, series };
  }).filter((column) => column.series.length > 0);
}

/** Returns the leading team id of a series, or null if tied / no wins yet. */
export function seriesLeaderId(series: Series): number | null {
  if (series.high.wins > series.low.wins) {
    return series.high.teamId;
  }
  if (series.low.wins > series.high.wins) {
    return series.low.teamId;
  }
  return null;
}

/** Wins needed to clinch a best-of-N series. */
export function clinchWins(bestOf: number): number {
  return Math.floor(bestOf / 2) + 1;
}

const ROUND_INDEX: Record<RoundName, number> = ROUND_ORDER.reduce(
  (acc, round, index) => {
    acc[round] = index;
    return acc;
  },
  {} as Record<RoundName, number>,
);

/** True iff `teamId` is one of the two teams in `series`. */
function teamInSeries(series: Series, teamId: number): boolean {
  return series.high.teamId === teamId || series.low.teamId === teamId;
}

/** The winner id of a FINAL series (the side that reached {@link clinchWins}). */
function finalWinnerId(series: Series): number {
  const needed = clinchWins(series.bestOf);
  return series.high.wins >= needed ? series.high.teamId : series.low.teamId;
}

/**
 * Returns every series a team appears in, sorted by {@link ROUND_ORDER} then by
 * the bracket's existing series order (stable). Pure.
 */
export function findTeamSeries(bracket: Bracket, teamId: number): Series[] {
  return bracket.series
    .map((series, index) => ({ series, index }))
    .filter(({ series }) => teamInSeries(series, teamId))
    .sort((a, b) => {
      const byRound =
        ROUND_INDEX[a.series.round] - ROUND_INDEX[b.series.round];
      return byRound !== 0 ? byRound : a.index - b.index;
    })
    .map(({ series }) => series);
}

/**
 * True iff the team lost at least one FINAL series (its wins fell short of the
 * clinch threshold). A team that never lost a final (still active, or a
 * champion) is NOT eliminated. Mirrors the elimination derivation in
 * `computeStandings()` in `./components/StandingsPanel`.
 */
export function isTeamEliminated(bracket: Bracket, teamId: number): boolean {
  return bracket.series.some(
    (series) =>
      series.status === 'final' &&
      teamInSeries(series, teamId) &&
      finalWinnerId(series) !== teamId,
  );
}

/** A team's current standing in the bracket, used by the header pin. */
export interface FavoriteSummary {
  teamId: number;
  /** False when the team appears in no series in this bracket. */
  inBracket: boolean;
  /** True iff the team lost a final series. */
  eliminated: boolean;
  /** True iff the team won a FINAL World Series. */
  isChampion: boolean;
  /**
   * The series to surface for the team: its in_progress series if any, else
   * its next scheduled series, else null. Used for the header status line.
   */
  currentSeries: Series | null;
  /** The furthest round the team has reached, or null if not in the bracket. */
  furthestRound: RoundName | null;
  /**
   * The team's win/loss record in {@link currentSeries}, from the team's own
   * perspective. Omitted when there is no current series.
   */
  record?: { wins: number; losses: number };
}

/**
 * Describes a (favorite) team's current standing for the header pin.
 *
 * A team not in the bracket yields `{ inBracket: false, ... }` and the UI
 * renders nothing for it. Champion/elimination logic matches
 * `computeStandings()`: a champion is the winner of a FINAL World Series.
 * Pure.
 */
export function favoriteSummary(
  bracket: Bracket,
  teamId: number,
): FavoriteSummary {
  const series = findTeamSeries(bracket, teamId);

  if (series.length === 0) {
    return {
      teamId,
      inBracket: false,
      eliminated: false,
      isChampion: false,
      currentSeries: null,
      furthestRound: null,
    };
  }

  const eliminated = isTeamEliminated(bracket, teamId);
  const isChampion = series.some(
    (s) =>
      s.round === 'World Series' &&
      s.status === 'final' &&
      finalWinnerId(s) === teamId,
  );

  // series is already in round order, so the last entry is the furthest round.
  const furthestRound = series[series.length - 1].round;

  // Prefer an in_progress series; otherwise the earliest scheduled one.
  const currentSeries =
    series.find((s) => s.status === 'in_progress') ??
    series.find((s) => s.status === 'scheduled') ??
    null;

  const summary: FavoriteSummary = {
    teamId,
    inBracket: true,
    eliminated,
    isChampion,
    currentSeries,
    furthestRound,
  };

  if (currentSeries) {
    const isHigh = currentSeries.high.teamId === teamId;
    const wins = isHigh ? currentSeries.high.wins : currentSeries.low.wins;
    const losses = isHigh ? currentSeries.low.wins : currentSeries.high.wins;
    summary.record = { wins, losses };
  }

  return summary;
}
