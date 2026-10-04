import { TEAMS } from '@mlb/shared';
import type { Bracket, League } from '@mlb/shared';
import { ROUND_ORDER, clinchWins } from '../bracketLayout';
import { TeamBadge } from './TeamBadge';

interface StandingsPanelProps {
  bracket: Bracket;
}

interface TeamProgress {
  teamId: number;
  furthestRound: string;
  eliminated: boolean;
  isChampion: boolean;
}

/**
 * Derives each participating team's postseason progress: the furthest round it
 * appeared in, whether it was eliminated, and whether it won the World Series.
 */
export function computeStandings(bracket: Bracket): Record<League, TeamProgress[]> {
  const progress = new Map<number, TeamProgress>();
  const roundIndex = (round: string) => ROUND_ORDER.indexOf(round as never);

  for (const series of bracket.series) {
    for (const side of [series.high, series.low]) {
      const existing = progress.get(side.teamId);
      if (!existing || roundIndex(series.round) > roundIndex(existing.furthestRound)) {
        progress.set(side.teamId, {
          teamId: side.teamId,
          furthestRound: series.round,
          eliminated: false,
          isChampion: false,
        });
      }
    }

    if (series.status === 'final') {
      const needed = clinchWins(series.bestOf);
      const winnerId =
        series.high.wins >= needed ? series.high.teamId : series.low.teamId;
      const loserId =
        winnerId === series.high.teamId ? series.low.teamId : series.high.teamId;
      const loser = progress.get(loserId);
      if (loser) loser.eliminated = true;
      if (series.round === 'World Series') {
        const champ = progress.get(winnerId);
        if (champ) champ.isChampion = true;
      }
    }
  }

  const grouped: Record<League, TeamProgress[]> = { AL: [], NL: [] };
  for (const entry of progress.values()) {
    const league = TEAMS[entry.teamId]?.league;
    if (league) grouped[league].push(entry);
  }
  for (const league of ['AL', 'NL'] as League[]) {
    grouped[league].sort((a, b) => a.teamId - b.teamId);
  }
  return grouped;
}

function statusLabel(entry: TeamProgress): string {
  if (entry.isChampion) return 'Champion';
  if (entry.eliminated) return `Out (${entry.furthestRound})`;
  return `Active (${entry.furthestRound})`;
}

export function StandingsPanel({ bracket }: StandingsPanelProps) {
  const standings = computeStandings(bracket);

  return (
    <section className="standings" aria-label="Postseason standings">
      <h2 className="standings__title">Standings</h2>
      <div className="standings__leagues">
        {(['AL', 'NL'] as League[]).map((league) => (
          <div key={league} className="standings__league">
            <h3 className="standings__league-title">
              {league === 'AL' ? 'American League' : 'National League'}
            </h3>
            <ul className="standings__list">
              {standings[league].map((entry) => (
                <li
                  key={entry.teamId}
                  className="standings__row"
                  data-team-id={entry.teamId}
                  data-champion={entry.isChampion || undefined}
                >
                  <TeamBadge teamId={entry.teamId} size={28} />
                  <span className="standings__team">{TEAMS[entry.teamId]?.name}</span>
                  <span className="standings__progress">{statusLabel(entry)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
