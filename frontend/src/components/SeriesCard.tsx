import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Series, SeriesTeam } from '@mlb/shared';
import { TeamBadge } from './TeamBadge';
import { clinchWins, seriesLeaderId } from '../bracketLayout';
import {
  roundName,
  statusLabel,
  teamAbbr,
  teamName,
  useI18n,
  type TFn,
} from '../i18n';

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

function TeamRow({
  t,
  team,
  isLeader,
  isWinner,
}: {
  t: TFn;
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
      <span className="series-team__name">{teamName(t, team.teamId)}</span>
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
  const { t } = useI18n();
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
      aria-label={t('series.region', {
        high: teamName(t, series.high.teamId),
        low: teamName(t, series.low.teamId),
      })}
    >
      <header className="series-card__header">
        <span className="series-card__round">{roundName(t, series.round)}</span>
        <span className="series-card__status" data-status={series.status}>
          {statusLabel(t, series.status)}
        </span>
      </header>

      <div className="series-card__teams">
        <TeamRow
          t={t}
          team={series.high}
          isLeader={leaderId === series.high.teamId}
          isWinner={isFinal && series.high.wins >= needed}
        />
        <TeamRow
          t={t}
          team={series.low}
          isLeader={leaderId === series.low.teamId}
          isWinner={isFinal && series.low.wins >= needed}
        />
      </div>

      <p className="series-card__meta">
        {t('series.bestOf', {
          bestOf: series.bestOf,
          highWins: series.high.wins,
          lowWins: series.low.wins,
        })}
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
            {gamesOpen ? t('series.hideGames') : t('series.showGames')}
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
                  {teamAbbr(t, game.away.teamId)} {game.away.score ?? '-'} @{' '}
                  {teamAbbr(t, game.home.teamId)} {game.home.score ?? '-'}
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
          {t('series.viewDetail')}
        </Link>
      )}

      {onSelect && predictable && !isFinal && (
        <button
          type="button"
          className="series-card__predict"
          onClick={() => onSelect(series.id)}
        >
          {selected ? t('series.selected') : t('series.predict')}
        </button>
      )}
    </article>
  );
}
