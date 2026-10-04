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
