/**
 * Data-integrity checks over the shared {@link Bracket} contract.
 *
 * The live MLB Stats API 2026 postseason feed can carry PLACEHOLDER team ids:
 * entries with names like 'AL Higher Seed' or 'Higher Seed League Champion'
 * that stand in for a matchup that is not yet determined. Those ids are not
 * real teams, so they are absent from the shared {@link TEAMS} map.
 *
 * A placeholder team is normal and expected in a not-yet-started (scheduled)
 * part of the bracket. It is a DATA-INTEGRITY PROBLEM only when it appears in a
 * context that is already FINISHED - a final series or a decided game - because
 * a completed matchup should reference the two real teams that played it.
 *
 * This module is a pure, dependency-free function over the shared types (no
 * AWS, no I/O), mirroring the precedent of `accuracy.ts` and `narrative.ts`,
 * so it is testable in isolation and reusable from both the backend handler and
 * any future consumer. It is re-exported from `index.ts`.
 */
import { TEAMS, type Bracket, type RoundName, type SeriesLeague } from './types.js';

/**
 * A single non-blocking data-integrity warning: a finished context (a final
 * series, or a decided game) that still references a placeholder/TBD team id
 * absent from {@link TEAMS}.
 */
export interface IntegrityWarning {
  /** Discriminator; the only kind of warning emitted today. */
  code: 'finished_game_tbd_team';
  seriesId: string;
  round: RoundName;
  league: SeriesLeague;
  /** The offending placeholder team id (absent from {@link TEAMS}). */
  teamId: number;
  /** Whether the placeholder was found at the series or an individual game. */
  scope: 'series' | 'game';
  /** Present only for `scope: 'game'`: the game that referenced the placeholder. */
  gamePk?: number;
}

/** A team id is a placeholder when it is not a key in the real-team map. */
function isPlaceholderTeam(teamId: number): boolean {
  return !(teamId in TEAMS);
}

/**
 * Round progression order, used to produce a deterministic, stably-ordered
 * warning list (earlier rounds first).
 */
const ROUND_ORDER: Record<RoundName, number> = {
  'Wild Card': 0,
  'Division Series': 1,
  'Championship Series': 2,
  'World Series': 3,
};

/**
 * Scans a bracket for finished contexts that reference a placeholder/TBD team.
 *
 * - Series scope: flagged when `series.status === 'final'` and either seed
 *   (`high.teamId` / `low.teamId`) is a placeholder.
 * - Game scope: flagged when a game is decided (`away.isWinner === true ||
 *   home.isWinner === true`) and a participating team id is a placeholder.
 *
 * A scheduled / in-progress series with placeholder seeds is NOT flagged - that
 * is the normal state of a not-yet-determined bracket.
 *
 * The returned list is de-duplicated (by code+seriesId+scope+teamId+gamePk) and
 * stably ordered by round progression, then seriesId, then scope (series before
 * game), then teamId, then gamePk, so the output is deterministic for a given
 * bracket regardless of input game ordering. An empty bracket, or a bracket
 * whose finished contexts reference only real teams, yields an empty array.
 */
export function findIntegrityWarnings(bracket: Bracket): IntegrityWarning[] {
  const warnings: IntegrityWarning[] = [];

  for (const series of bracket.series) {
    // Series-level: a finished series must reference two real teams.
    if (series.status === 'final') {
      for (const teamId of [series.high.teamId, series.low.teamId]) {
        if (isPlaceholderTeam(teamId)) {
          warnings.push({
            code: 'finished_game_tbd_team',
            seriesId: series.id,
            round: series.round,
            league: series.league,
            teamId,
            scope: 'series',
          });
        }
      }
    }

    // Game-level: a decided game must reference two real teams, regardless of
    // the series' overall status (a decided game inside an in-progress series
    // still should not reference a placeholder).
    for (const game of series.games) {
      const decided = game.away.isWinner === true || game.home.isWinner === true;
      if (!decided) {
        continue;
      }
      for (const teamId of [game.away.teamId, game.home.teamId]) {
        if (isPlaceholderTeam(teamId)) {
          warnings.push({
            code: 'finished_game_tbd_team',
            seriesId: series.id,
            round: series.round,
            league: series.league,
            teamId,
            scope: 'game',
            gamePk: game.gamePk,
          });
        }
      }
    }
  }

  return dedupeAndSort(warnings);
}

/** De-duplicates by identity key and sorts into a deterministic order. */
function dedupeAndSort(warnings: IntegrityWarning[]): IntegrityWarning[] {
  const seen = new Map<string, IntegrityWarning>();
  for (const w of warnings) {
    const key = `${w.code}|${w.seriesId}|${w.scope}|${w.teamId}|${w.gamePk ?? ''}`;
    if (!seen.has(key)) {
      seen.set(key, w);
    }
  }

  return [...seen.values()].sort((a, b) => {
    const roundDelta = ROUND_ORDER[a.round] - ROUND_ORDER[b.round];
    if (roundDelta !== 0) return roundDelta;
    if (a.seriesId !== b.seriesId) return a.seriesId < b.seriesId ? -1 : 1;
    // 'game' sorts after 'series' for the same series.
    if (a.scope !== b.scope) return a.scope === 'series' ? -1 : 1;
    if (a.teamId !== b.teamId) return a.teamId - b.teamId;
    return (a.gamePk ?? 0) - (b.gamePk ?? 0);
  });
}
