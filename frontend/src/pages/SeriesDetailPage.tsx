import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Bracket, GameResult, Series } from '@mlb/shared';
import { getBracket } from '../api';
import { parseSeasonParam } from '../seasonRoute';
import { clinchWins } from '../bracketLayout';
import {
  roundName,
  teamAbbr,
  teamName,
  useI18n,
  type TFn,
} from '../i18n';
import { TeamBadge } from '../components/TeamBadge';
import { LanguageToggle } from '../components/LanguageToggle';
import { ThemeToggle } from '../components/ThemeToggle';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; bracket: Bracket };

/**
 * Dedicated detail page for a finished (status==='final') series. Loads the
 * bracket for the route's season (reusing the api.ts offline seed fallback),
 * finds the series by id, and renders its full game-by-game detail (teams,
 * per-game scores, winner, series result) with a back link to the bracket.
 *
 * An unknown series id is handled gracefully with a friendly message and a link
 * back to the bracket.
 */
export function SeriesDetailPage() {
  const params = useParams();
  const { t } = useI18n();
  const season = parseSeasonParam(params.season);
  const seriesId = params.seriesId ?? '';

  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    getBracket(season)
      .then(({ bracket }) => {
        if (!cancelled) setState({ status: 'ready', bracket });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : 'Failed to load bracket';
          setState({ status: 'error', message });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [season]);

  const backTo = `/season/${season}`;
  const series =
    state.status === 'ready'
      ? state.bracket.series.find((s) => s.id === seriesId) ?? null
      : null;

  return (
    <div className="app">
      <nav className="detail__nav" aria-label={t('detail.breadcrumb')}>
        <Link className="detail__back" to={backTo}>
          {t('detail.back', { season })}
        </Link>
        <div className="app__controls app__controls--detail">
          <ThemeToggle />
          <LanguageToggle />
        </div>
      </nav>

      {state.status === 'loading' && (
        <p className="app__status" role="status">
          {t('detail.loading')}
        </p>
      )}

      {state.status === 'error' && (
        <p className="app__status app__status--error" role="alert">
          {state.message}
        </p>
      )}

      {state.status === 'ready' && !series && (
        <section
          className="detail detail--missing"
          aria-label={t('detail.notFound.region')}
        >
          <h1 className="detail__title">{t('detail.notFound.title')}</h1>
          <p className="detail__hint">
            {t('detail.notFound.hint', { seriesId, season })}
          </p>
          <Link className="detail__back" to={backTo}>
            {t('detail.return', { season })}
          </Link>
        </section>
      )}

      {state.status === 'ready' && series && (
        <SeriesDetail t={t} series={series} season={season} />
      )}
    </div>
  );
}

function SeriesDetail({
  t,
  series,
  season,
}: {
  t: TFn;
  series: Series;
  season: number;
}) {
  const needed = clinchWins(series.bestOf);
  const highWon = series.status === 'final' && series.high.wins >= needed;
  const lowWon = series.status === 'final' && series.low.wins >= needed;
  const winnerId = highWon
    ? series.high.teamId
    : lowWon
      ? series.low.teamId
      : null;

  return (
    <section
      className="detail"
      aria-label={t('detail.region', {
        high: teamName(t, series.high.teamId),
        low: teamName(t, series.low.teamId),
      })}
    >
      <header className="detail__header">
        <p className="detail__round">
          {season} &middot; {roundName(t, series.round)}
        </p>
        <h1 className="detail__title">
          {teamName(t, series.high.teamId)} {t('detail.vs')}{' '}
          {teamName(t, series.low.teamId)}
        </h1>
        <p className="detail__result">
          {winnerId !== null ? (
            <>
              <strong>{teamName(t, winnerId)}</strong>{' '}
              {t('detail.wonSeries', {
                hi: Math.max(series.high.wins, series.low.wins),
                lo: Math.min(series.high.wins, series.low.wins),
              })}
            </>
          ) : (
            t('detail.seriesScore', {
              hi: series.high.wins,
              lo: series.low.wins,
              bestOf: series.bestOf,
            })
          )}
        </p>
      </header>

      <div className="detail__teams">
        <DetailTeam t={t} teamId={series.high.teamId} wins={series.high.wins} isWinner={highWon} />
        <DetailTeam t={t} teamId={series.low.teamId} wins={series.low.wins} isWinner={lowWon} />
      </div>

      <h2 className="detail__games-title">{t('detail.gameByGame')}</h2>
      {series.games.length > 0 ? (
        <ol className="detail__games">
          {series.games.map((game) => (
            <DetailGame key={game.gamePk} t={t} game={game} />
          ))}
        </ol>
      ) : (
        <p className="detail__hint">{t('detail.noGames')}</p>
      )}
    </section>
  );
}

function DetailTeam({
  t,
  teamId,
  wins,
  isWinner,
}: {
  t: TFn;
  teamId: number;
  wins: number;
  isWinner: boolean;
}) {
  const classes = ['detail__team'];
  if (isWinner) classes.push('detail__team--winner');
  return (
    <div className={classes.join(' ')}>
      <TeamBadge teamId={teamId} size={44} />
      <span className="detail__team-name">{teamName(t, teamId)}</span>
      <span className="detail__team-wins">{wins}</span>
    </div>
  );
}

function DetailGame({ t, game }: { t: TFn; game: GameResult }) {
  const awayScore = game.away.score ?? '-';
  const homeScore = game.home.score ?? '-';
  const winnerSide =
    game.away.isWinner === true
      ? 'away'
      : game.home.isWinner === true
        ? 'home'
        : null;

  return (
    <li className="detail__game">
      <span className="detail__game-num">
        {t('detail.game', { n: game.seriesGameNumber })}
      </span>
      <span
        className={
          'detail__game-side' +
          (winnerSide === 'away' ? ' detail__game-side--winner' : '')
        }
      >
        {teamAbbr(t, game.away.teamId)} {awayScore}
      </span>
      <span className="detail__game-at">{t('detail.at')}</span>
      <span
        className={
          'detail__game-side' +
          (winnerSide === 'home' ? ' detail__game-side--winner' : '')
        }
      >
        {teamAbbr(t, game.home.teamId)} {homeScore}
      </span>
    </li>
  );
}
