import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { TEAMS } from '@mlb/shared';
import type { Bracket, GameResult, Series } from '@mlb/shared';
import { getBracket } from '../api';
import { parseSeasonParam } from '../seasonRoute';
import { clinchWins } from '../bracketLayout';
import { TeamBadge } from '../components/TeamBadge';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; bracket: Bracket };

function teamName(teamId: number): string {
  return TEAMS[teamId]?.name ?? `Team ${teamId}`;
}

function teamAbbr(teamId: number): string {
  return TEAMS[teamId]?.abbreviation ?? String(teamId);
}

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
      <nav className="detail__nav" aria-label="Breadcrumb">
        <Link className="detail__back" to={backTo}>
          &larr; Back to the {season} bracket
        </Link>
      </nav>

      {state.status === 'loading' && (
        <p className="app__status" role="status">
          Loading series detail&hellip;
        </p>
      )}

      {state.status === 'error' && (
        <p className="app__status app__status--error" role="alert">
          {state.message}
        </p>
      )}

      {state.status === 'ready' && !series && (
        <section className="detail detail--missing" aria-label="Series not found">
          <h1 className="detail__title">Series not found</h1>
          <p className="detail__hint">
            We could not find a series with id &ldquo;{seriesId}&rdquo; in the{' '}
            {season} postseason.
          </p>
          <Link className="detail__back" to={backTo}>
            Return to the {season} bracket
          </Link>
        </section>
      )}

      {state.status === 'ready' && series && (
        <SeriesDetail series={series} season={season} />
      )}
    </div>
  );
}

function SeriesDetail({ series, season }: { series: Series; season: number }) {
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
      aria-label={`${teamName(series.high.teamId)} versus ${teamName(series.low.teamId)} detail`}
    >
      <header className="detail__header">
        <p className="detail__round">
          {season} &middot; {series.round}
        </p>
        <h1 className="detail__title">
          {teamName(series.high.teamId)} vs {teamName(series.low.teamId)}
        </h1>
        <p className="detail__result">
          {winnerId !== null ? (
            <>
              <strong>{teamName(winnerId)}</strong> won the series{' '}
              {Math.max(series.high.wins, series.low.wins)}&ndash;
              {Math.min(series.high.wins, series.low.wins)}
            </>
          ) : (
            <>
              Series {series.high.wins}&ndash;{series.low.wins} &middot; Best of{' '}
              {series.bestOf}
            </>
          )}
        </p>
      </header>

      <div className="detail__teams">
        <DetailTeam teamId={series.high.teamId} wins={series.high.wins} isWinner={highWon} />
        <DetailTeam teamId={series.low.teamId} wins={series.low.wins} isWinner={lowWon} />
      </div>

      <h2 className="detail__games-title">Game by game</h2>
      {series.games.length > 0 ? (
        <ol className="detail__games">
          {series.games.map((game) => (
            <DetailGame key={game.gamePk} game={game} />
          ))}
        </ol>
      ) : (
        <p className="detail__hint">No game detail is available for this series.</p>
      )}
    </section>
  );
}

function DetailTeam({
  teamId,
  wins,
  isWinner,
}: {
  teamId: number;
  wins: number;
  isWinner: boolean;
}) {
  const classes = ['detail__team'];
  if (isWinner) classes.push('detail__team--winner');
  return (
    <div className={classes.join(' ')}>
      <TeamBadge teamId={teamId} size={44} />
      <span className="detail__team-name">{teamName(teamId)}</span>
      <span className="detail__team-wins">{wins}</span>
    </div>
  );
}

function DetailGame({ game }: { game: GameResult }) {
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
      <span className="detail__game-num">Game {game.seriesGameNumber}</span>
      <span
        className={
          'detail__game-side' +
          (winnerSide === 'away' ? ' detail__game-side--winner' : '')
        }
      >
        {teamAbbr(game.away.teamId)} {awayScore}
      </span>
      <span className="detail__game-at">@</span>
      <span
        className={
          'detail__game-side' +
          (winnerSide === 'home' ? ' detail__game-side--winner' : '')
        }
      >
        {teamAbbr(game.home.teamId)} {homeScore}
      </span>
    </li>
  );
}
