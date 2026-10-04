import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { TEAMS } from '@mlb/shared';
import type { Series, SeriesTeam } from '@mlb/shared';
import { TeamBadge } from './TeamBadge';
import { clinchWins, seriesLeaderId } from '../bracketLayout';

interface SeriesCardProps {
  series: Series;
  /** The season being viewed; used to build the series detail-page link. */
  season: number;
  selected?: boolean;
  onSelect?: (seriesId: string) => void;
  /**
   * Whether the current season is predictable (current year). When false
   * (results-only seasons) the interactive "Predict winner" button is replaced
   * with a non-interactive affordance to view game-by-game detail, so a user
   * cannot trigger a prediction the backend refuses. Defaults to true.
   */
  predictable?: boolean;
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

export function SeriesCard({
  series,
  season,
  selected = false,
  onSelect,
  predictable = true,
}: SeriesCardProps) {
  const leaderId = seriesLeaderId(series);
  const needed = clinchWins(series.bestOf);
  const isFinal = series.status === 'final';
  const hasGames = series.games.length > 0;

  // Game-by-game detail is collapsed by default so every card starts at a
  // consistent compact height (the primary fix for the uneven "gatagata"
  // layout). A per-series toggle reveals/hides the list.
  const [gamesOpen, setGamesOpen] = useState(false);
  // React's useId() returns ids containing colons (e.g. ":r5:") which are not
  // valid in CSS id selectors; strip them so `aria-controls`/`#id` lookups work
  // in the browser and in Playwright locators.
  const reactId = useId().replace(/:/g, '');
  const gamesListId = `games-${reactId}`;

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

      {hasGames && (
        <div className="series-card__games-wrap">
          <button
            type="button"
            className="series-card__games-toggle"
            aria-expanded={gamesOpen}
            aria-controls={gamesListId}
            onClick={() => setGamesOpen((open) => !open)}
          >
            {gamesOpen ? 'Hide games' : 'Show games'}
          </button>
          <ol
            id={gamesListId}
            className="series-card__games"
            hidden={!gamesOpen}
          >
            {series.games.map((game) => (
              <li key={game.gamePk} className="series-card__game">
                <span className="series-card__game-num">
                  G{game.seriesGameNumber}
                </span>
                <span className="series-card__game-score">
                  {TEAMS[game.away.teamId]?.abbreviation ?? game.away.teamId}{' '}
                  {game.away.score ?? '-'} @{' '}
                  {TEAMS[game.home.teamId]?.abbreviation ?? game.home.teamId}{' '}
                  {game.home.score ?? '-'}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/*
        A finished series links to its dedicated detail page (requirement #3).
        The inline toggle above is kept for a quick peek; the detail page shows
        the full game-by-game breakdown with teams, scores, winner, and result.
      */}
      {isFinal && (
        <Link
          className="series-card__detail-link"
          to={`/season/${season}/series/${encodeURIComponent(series.id)}`}
        >
          View series detail
        </Link>
      )}

      {onSelect && predictable && !isFinal && (
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
