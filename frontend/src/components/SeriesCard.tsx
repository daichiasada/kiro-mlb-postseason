import { TEAMS } from '@mlb/shared';
import type { Series, SeriesTeam } from '@mlb/shared';
import { TeamBadge } from './TeamBadge';
import { clinchWins, seriesLeaderId } from '../bracketLayout';

interface SeriesCardProps {
  series: Series;
  selected?: boolean;
  onSelect?: (seriesId: string) => void;
}

function teamName(teamId: number): string {
  return TEAMS[teamId]?.name ?? `Team ${teamId}`;
}

const STATUS_LABEL: Record<Series['status'], string> = {
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  final: 'Final',
};

function TeamRow({
  team,
  isLeader,
  isWinner,
}: {
  team: SeriesTeam;
  isLeader: boolean;
  isWinner: boolean;
}) {
  const classes = ['series-team'];
  if (isWinner) classes.push('series-team--winner');
  else if (isLeader) classes.push('series-team--leader');

  return (
    <div className={classes.join(' ')}>
      <TeamBadge teamId={team.teamId} size={32} />
      <span className="series-team__name">{teamName(team.teamId)}</span>
      <span className="series-team__wins">{team.wins}</span>
    </div>
  );
}

export function SeriesCard({ series, selected = false, onSelect }: SeriesCardProps) {
  const leaderId = seriesLeaderId(series);
  const needed = clinchWins(series.bestOf);
  const isFinal = series.status === 'final';
  const classes = ['series-card'];
  if (selected) classes.push('series-card--selected');

  return (
    <article
      className={classes.join(' ')}
      data-series-id={series.id}
      aria-label={`${teamName(series.high.teamId)} versus ${teamName(series.low.teamId)}`}
    >
      <header className="series-card__header">
        <span className="series-card__round">{series.round}</span>
        <span className="series-card__status" data-status={series.status}>
          {STATUS_LABEL[series.status]}
        </span>
      </header>

      <div className="series-card__teams">
        <TeamRow
          team={series.high}
          isLeader={leaderId === series.high.teamId}
          isWinner={isFinal && series.high.wins >= needed}
        />
        <TeamRow
          team={series.low}
          isLeader={leaderId === series.low.teamId}
          isWinner={isFinal && series.low.wins >= needed}
        />
      </div>

      <p className="series-card__meta">
        Best of {series.bestOf} &middot; {series.high.wins}&ndash;{series.low.wins}
      </p>

      {series.games.length > 0 && (
        <ol className="series-card__games">
          {series.games.map((game) => (
            <li key={game.gamePk} className="series-card__game">
              <span className="series-card__game-num">G{game.seriesGameNumber}</span>
              <span className="series-card__game-score">
                {TEAMS[game.away.teamId]?.abbreviation ?? game.away.teamId}{' '}
                {game.away.score ?? '-'} @{' '}
                {TEAMS[game.home.teamId]?.abbreviation ?? game.home.teamId}{' '}
                {game.home.score ?? '-'}
              </span>
            </li>
          ))}
        </ol>
      )}

      {onSelect && (
        <button
          type="button"
          className="series-card__predict"
          onClick={() => onSelect(series.id)}
        >
          {selected ? 'Selected for prediction' : 'Predict winner'}
        </button>
      )}
    </article>
  );
}
