import { TEAMS } from '@mlb/shared';
import type { Bracket, League, RoundName } from '@mlb/shared';
import { ROUND_ORDER, clinchWins } from '../bracketLayout';
import { roundName, teamName, useI18n, type TFn } from '../i18n';
import { TeamBadge } from './TeamBadge';
import { FavoriteToggle } from './FavoriteToggle';

interface StandingsPanelProps {
  bracket: Bracket;
}

interface TeamProgress {
  teamId: number;
  furthestRound: RoundName;
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

function progressLabel(t: TFn, entry: TeamProgress): string {
  const round = roundName(t, entry.furthestRound);
  if (entry.isChampion) return t('standings.champion');
  if (entry.eliminated) return t('standings.out', { round });
  return t('standings.active', { round });
}

export function StandingsPanel({ bracket }: StandingsPanelProps) {
  const { t } = useI18n();
  const standings = computeStandings(bracket);

  return (
    <section className="standings" aria-label={t('standings.region')}>
      <h2 className="standings__title">{t('standings.title')}</h2>
      <div className="standings__leagues">
        {(['AL', 'NL'] as League[]).map((league) => (
          <div key={league} className="standings__league">
            <h3 className="standings__league-title">
              {league === 'AL' ? t('standings.al') : t('standings.nl')}
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
                  <span className="standings__team">
                    {teamName(t, entry.teamId)}
                  </span>
                  <span className="standings__progress">
                    {progressLabel(t, entry)}
                  </span>
                  <FavoriteToggle teamId={entry.teamId} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
