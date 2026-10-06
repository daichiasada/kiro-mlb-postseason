/**
 * Pure aggregation of the MLB Stats API standings response into the
 * {@link WinPctMap} consumed by the prediction model.
 *
 * These functions are side-effect-free (no network, no AWS) so they can be
 * unit-tested with fixture JSON. They never throw: a malformed, empty, or
 * early-season standings response simply yields an empty map / `null` metric.
 */
import type { RawStandingsResponse } from '../mlb/client.js';
import type { WinPctMap } from './model.js';

/**
 * Builds a {@link WinPctMap} (team id -> win pct in [0, 1]) from a standings
 * response. Iterates every division's `teamRecords`, parses
 * `winningPercentage` (a string like `'.580'` or `'0.580'`) via `Number()`,
 * and maps `team.id -> pct`. Entries with a missing `team.id` or a
 * non-finite / out-of-range parsed pct are skipped. Returns `{}` for an empty,
 * absent, or early-season response (no `teamRecords`). Never throws.
 */
export function winPctFromStandings(response: RawStandingsResponse): WinPctMap {
  const map: WinPctMap = {};
  const records = response.records ?? [];

  for (const record of records) {
    const teamRecords = record.teamRecords ?? [];
    for (const teamRecord of teamRecords) {
      const teamId = teamRecord.team?.id;
      if (typeof teamId !== 'number' || !Number.isFinite(teamId)) {
        continue;
      }
      const raw = teamRecord.winningPercentage;
      if (raw === undefined || raw === null || raw === '') {
        continue;
      }
      const pct = Number(raw);
      if (!Number.isFinite(pct) || pct < 0 || pct > 1) {
        continue;
      }
      map[teamId] = pct;
    }
  }

  return map;
}

/**
 * Resolves a single team's metric from a {@link WinPctMap}. Returns the stored
 * win pct, or `null` when the team is absent (standings unknown / neutral
 * fallback was used for that team).
 */
export function teamMetric(
  winPct: WinPctMap,
  teamId: number,
): { teamId: number; winPct: number | null } {
  return { teamId, winPct: winPct[teamId] ?? null };
}
