/**
 * Pure aggregation of raw MLB Stats API games into the shared {@link Bracket}
 * shape. No network or AWS access, so it is fully unit-testable.
 */
import {
  TEAMS,
  type Bracket,
  type GameResult,
  type RoundName,
  type Series,
  type SeriesLeague,
  type SeriesStatus,
} from '@mlb/shared';
import type { RawGame } from './client.js';

/** Maps a raw `seriesDescription` to the canonical {@link RoundName}. */
export function mapRound(seriesDescription: string): RoundName {
  const desc = seriesDescription.toLowerCase();
  if (desc.includes('wild card')) return 'Wild Card';
  if (desc.includes('division series')) return 'Division Series';
  if (desc.includes('championship series')) return 'Championship Series';
  if (desc.includes('world series')) return 'World Series';
  // Fall back to Division Series for any unexpected description so aggregation
  // never throws on data drift; callers treat the bracket as best-effort.
  return 'Division Series';
}

/** Derives the series league ('AL' | 'NL' | 'WS') from a raw description. */
export function mapLeague(seriesDescription: string): SeriesLeague {
  const desc = seriesDescription.toLowerCase();
  if (desc.includes('world series')) return 'WS';
  if (desc.startsWith('al')) return 'AL';
  if (desc.startsWith('nl')) return 'NL';
  return 'WS';
}

/** `best-of` games required for the round (used when gamesInSeries is absent). */
function bestOfForRound(round: RoundName): number {
  switch (round) {
    case 'Wild Card':
      return 3;
    case 'Division Series':
      return 5;
    default:
      return 7;
  }
}

interface SeriesAccumulator {
  round: RoundName;
  league: SeriesLeague;
  highId: number;
  lowId: number;
  bestOf: number;
  games: GameResult[];
}

/**
 * Builds a stable grouping key from the series description plus the unordered
 * pair of team ids, so both teams map to the same series regardless of which
 * one was home in a given game.
 */
function groupKey(seriesDescription: string, awayId: number, homeId: number): string {
  const [a, b] = [awayId, homeId].sort((x, y) => x - y);
  return `${seriesDescription}::${a}-${b}`;
}

function toSlug(round: RoundName): string {
  return round.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Aggregates raw postseason games into a {@link Bracket}.
 *
 * Games are grouped into series by `(seriesDescription + unordered team pair)`.
 * The "high" seed is the home team of game 1 (home-field advantage); wins are
 * computed from each game's `isWinner`. Status is derived from whether either
 * team reached the clinch count (ceil(bestOf / 2)).
 */
export function aggregateBracket(games: RawGame[], season: number): Bracket {
  const groups = new Map<string, SeriesAccumulator>();

  for (const game of games) {
    const awayId = game.teams.away.team.id;
    const homeId = game.teams.home.team.id;
    const key = groupKey(game.seriesDescription, awayId, homeId);
    const round = mapRound(game.seriesDescription);

    let acc = groups.get(key);
    if (!acc) {
      acc = {
        round,
        league: mapLeague(game.seriesDescription),
        // High seed = home team of game 1. Default to this game's home team and
        // refine below once game 1 is seen.
        highId: homeId,
        lowId: awayId,
        bestOf: game.gamesInSeries || bestOfForRound(round),
        games: [],
      };
      groups.set(key, acc);
    }

    // The home team of game 1 holds home-field advantage; treat it as the high seed.
    if (game.seriesGameNumber === 1) {
      acc.highId = homeId;
      acc.lowId = awayId;
    }

    const gameResult: GameResult = {
      gamePk: game.gamePk,
      date: game.gameDate.slice(0, 10),
      away: {
        teamId: awayId,
        score: game.teams.away.score ?? null,
        isWinner: game.teams.away.isWinner ?? null,
      },
      home: {
        teamId: homeId,
        score: game.teams.home.score ?? null,
        isWinner: game.teams.home.isWinner ?? null,
      },
      seriesGameNumber: game.seriesGameNumber,
    };
    acc.games.push(gameResult);
  }

  const series: Series[] = [];
  for (const acc of groups.values()) {
    acc.games.sort((a, b) => a.seriesGameNumber - b.seriesGameNumber);

    let highWins = 0;
    let lowWins = 0;
    for (const g of acc.games) {
      const winnerId =
        g.away.isWinner === true
          ? g.away.teamId
          : g.home.isWinner === true
            ? g.home.teamId
            : null;
      if (winnerId === acc.highId) highWins += 1;
      else if (winnerId === acc.lowId) lowWins += 1;
    }

    // A game counts as "decided" once it has a real winner. The live MLB Stats
    // API lists not-yet-played games as "Preview" entries with null scores and
    // null isWinner; a series whose only games are previews has decided nothing
    // and must be treated as not-yet-started ('scheduled'), not 'in_progress'.
    // Otherwise a preview-only 2026 series would render as a live 0-0 card and
    // be treated as predictable, which is the opposite of the intended
    // upcoming/empty behavior (see the upcoming guard in bracketService and
    // hasStartedContent in the frontend App).
    const decidedGames = acc.games.filter(
      (g) => g.away.isWinner === true || g.home.isWinner === true,
    ).length;

    const clinch = Math.ceil(acc.bestOf / 2);
    let status: SeriesStatus;
    if (highWins >= clinch || lowWins >= clinch) {
      status = 'final';
    } else if (decidedGames === 0) {
      status = 'scheduled';
    } else {
      status = 'in_progress';
    }

    series.push({
      id: `${season}-${acc.league.toLowerCase()}-${toSlug(acc.round)}-${acc.highId}-${acc.lowId}`,
      round: acc.round,
      league: acc.league,
      high: { teamId: acc.highId, wins: highWins },
      low: { teamId: acc.lowId, wins: lowWins },
      bestOf: acc.bestOf,
      status,
      games: acc.games,
    });
  }

  // Stable ordering: by round progression, then league, then high seed id.
  const roundOrder: RoundName[] = [
    'Wild Card',
    'Division Series',
    'Championship Series',
    'World Series',
  ];
  series.sort((a, b) => {
    const r = roundOrder.indexOf(a.round) - roundOrder.indexOf(b.round);
    if (r !== 0) return r;
    if (a.league !== b.league) return a.league.localeCompare(b.league);
    return a.high.teamId - b.high.teamId;
  });

  return {
    season,
    updatedAt: new Date().toISOString(),
    series,
  };
}

/** Re-export for callers that want team metadata alongside aggregation. */
export { TEAMS };
