import { useEffect, useId, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type {
  Bracket,
  GameDetailResponse,
  GameResult,
  InningLine,
  LineScoreSide,
  Series,
} from '@mlb/shared';
import { getBracket, getGameDetail } from '../api';
import { parseSeasonParam } from '../seasonRoute';
import { isPredictable } from '@mlb/shared';
import { clinchWins } from '../bracketLayout';
import { SeriesFlowCharts } from '../components/SeriesFlowCharts';
import {
  roundName,
  teamAbbr,
  teamName,
  useI18n,
  type TFn,
  type Lang,
} from '../i18n';
import { formatStartTime, resolveTimeZone } from '../gameTime';
import { TeamBadge } from '../components/TeamBadge';
import { LanguageToggle } from '../components/LanguageToggle';
import { ThemeToggle } from '../components/ThemeToggle';
import { ShareButton } from '../components/ShareButton';
import { SHARE_DISCLAIMER } from '@mlb/shared';

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
  const { t, lang } = useI18n();
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
        <SeriesDetail
          t={t}
          lang={lang}
          series={series}
          season={season}
          bracket={state.bracket}
        />
      )}
    </div>
  );
}

function SeriesDetail({
  t,
  lang,
  series,
  season,
  bracket,
}: {
  t: TFn;
  lang: Lang;
  series: Series;
  season: number;
  bracket: Bracket;
}) {
  const timeZone = resolveTimeZone();
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
        <ShareButton
          season={season}
          seriesId={series.id}
          title={`${teamName(t, series.high.teamId)} ${t('detail.vs')} ${teamName(
            t,
            series.low.teamId,
          )} - ${roundName(t, series.round)}`}
          disclaimer={SHARE_DISCLAIMER[lang]}
        />
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

      <SeriesFlowCharts
        series={series}
        bracket={bracket}
        season={season}
        predictable={isPredictable(season)}
      />

      <h2 className="detail__games-title">{t('detail.gameByGame')}</h2>
      {series.games.length > 0 ? (
        <ol className="detail__games">
          {series.games.map((game) => (
            <DetailGame
              key={game.gamePk}
              t={t}
              lang={lang}
              game={game}
              timeZone={timeZone}
            />
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

/**
 * Per-game accordion state. The panel lazy-fetches /game only on first expand:
 *   - idle: never fetched (collapsed, or expanded before the fetch resolves)
 *   - loading: a fetch is in flight
 *   - ready: an `ok` GameDetailResponse arrived; render the detail panel
 *   - fallback: the fetch rejected OR returned `status:'unavailable'`; show a
 *     gentle inline note and keep the always-visible final score (criterion 2)
 */
type GameDetailState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; detail: Extract<GameDetailResponse, { status: 'ok' }> }
  | { status: 'fallback' };

/** A line-score cell value: a number, or a localized dash when unknown/null. */
function cell(value: number | null): string {
  return value === null ? '-' : String(value);
}

function DetailGame({
  t,
  lang,
  game,
  timeZone,
}: {
  t: TFn;
  lang: Lang;
  game: GameResult;
  timeZone: string;
}) {
  const awayScore = game.away.score ?? '-';
  const homeScore = game.home.score ?? '-';
  const winnerSide =
    game.away.isWinner === true
      ? 'away'
      : game.home.isWinner === true
        ? 'home'
        : null;
  const localTime = formatStartTime(game.startTime, {
    lang,
    timeZone,
    timeTbd: game.timeTbd,
    tbdLabel: t('gametime.tbd'),
  });

  const [open, setOpen] = useState(false);
  const [detailState, setDetailState] = useState<GameDetailState>({
    status: 'idle',
  });
  // useId() yields colons that are invalid in CSS/DOM id selectors; strip them
  // so aria-controls / #id lookups work in the browser and in Playwright.
  const panelId = `game-detail-${useId().replace(/:/g, '')}`;

  function handleToggle() {
    const next = !open;
    setOpen(next);
    // Lazy fetch: only fire on the FIRST expand, and never after a result has
    // settled (ready or fallback) so re-collapsing/expanding is free.
    if (next && detailState.status === 'idle') {
      setDetailState({ status: 'loading' });
      getGameDetail(game.gamePk)
        .then((detail) => {
          if (detail.status === 'ok') {
            setDetailState({ status: 'ready', detail });
          } else {
            // Documented 'unavailable' fallback: treat like an error.
            setDetailState({ status: 'fallback' });
          }
        })
        .catch(() => {
          setDetailState({ status: 'fallback' });
        });
    }
  }

  return (
    <li className="detail__game">
      <div className="detail__game-row">
        <button
          type="button"
          className="detail__game-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={handleToggle}
        >
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
          <span className="detail__game-time">{localTime}</span>
          <span className="detail__game-toggle-label">
            {open ? t('detail.game.collapse') : t('detail.game.expand')}
          </span>
        </button>
      </div>

      <div
        id={panelId}
        className="detail__game-panel"
        role="region"
        aria-label={t('detail.game', { n: game.seriesGameNumber })}
        hidden={!open}
      >
        {detailState.status === 'loading' && (
          <p className="detail__game-status" role="status">
            {t('detail.game.loading')}
          </p>
        )}
        {detailState.status === 'fallback' && (
          <p className="detail__game-status detail__game-status--error" role="status">
            {t('detail.game.error')}
          </p>
        )}
        {detailState.status === 'ready' && (
          <GameDetailPanel t={t} game={game} detail={detailState.detail} />
        )}
      </div>
    </li>
  );
}

/**
 * The expanded, successful game-detail panel: venue, W/L/S pitchers (the save
 * line omitted when absent), an optional recap highlight link, and the inning
 * R/H/E table wrapped in a horizontally-scrollable container so it scrolls on
 * narrow screens without forcing page-level horizontal overflow (criterion 3).
 */
function GameDetailPanel({
  t,
  game,
  detail,
}: {
  t: TFn;
  game: GameResult;
  detail: Extract<GameDetailResponse, { status: 'ok' }>;
}) {
  const { venue, pitchers, highlight, innings, totals } = detail;
  const awayLabel = teamAbbr(t, game.away.teamId);
  const homeLabel = teamAbbr(t, game.home.teamId);

  return (
    <div className="detail__linescore-wrap">
      {venue !== undefined && venue !== '' && (
        <p className="detail__game-venue">
          <span className="detail__game-venue-label">
            {t('detail.game.venue')}:
          </span>{' '}
          {venue}
        </p>
      )}

      <dl className="detail__game-pitchers">
        {pitchers.winner !== undefined && (
          <div className="detail__game-pitcher">
            <dt>{t('detail.game.winPitcher')}</dt>
            <dd>{pitchers.winner}</dd>
          </div>
        )}
        {pitchers.loser !== undefined && (
          <div className="detail__game-pitcher">
            <dt>{t('detail.game.losePitcher')}</dt>
            <dd>{pitchers.loser}</dd>
          </div>
        )}
        {pitchers.save !== undefined && (
          <div className="detail__game-pitcher">
            <dt>{t('detail.game.savePitcher')}</dt>
            <dd>{pitchers.save}</dd>
          </div>
        )}
      </dl>

      <div className="detail__linescore-scroll">
        <table className="detail__linescore">
          <thead>
            <tr>
              <th scope="col">{t('detail.game.inning')}</th>
              {innings.map((inning) => (
                <th scope="col" key={inning.inning}>
                  {inning.ordinal ?? inning.inning}
                </th>
              ))}
              <th scope="col" title={t('detail.game.runs')}>
                {t('detail.game.runsShort')}
              </th>
              <th scope="col" title={t('detail.game.hits')}>
                {t('detail.game.hitsShort')}
              </th>
              <th scope="col" title={t('detail.game.errors')}>
                {t('detail.game.errorsShort')}
              </th>
            </tr>
          </thead>
          <tbody>
            <LineScoreRow
              label={awayLabel}
              innings={innings}
              side="away"
              totals={totals.away}
            />
            <LineScoreRow
              label={homeLabel}
              innings={innings}
              side="home"
              totals={totals.home}
            />
          </tbody>
        </table>
      </div>

      {highlight !== undefined && (
        <p className="detail__game-highlight">
          <a
            href={highlight.url}
            target="_blank"
            rel="noopener noreferrer"
            className="detail__game-highlight-link"
          >
            {t('detail.game.highlights')}: {highlight.title}
          </a>
        </p>
      )}
    </div>
  );
}

/** One body row (away or home) of the inning R/H/E line-score table. */
function LineScoreRow({
  label,
  innings,
  side,
  totals,
}: {
  label: string;
  innings: InningLine[];
  side: 'away' | 'home';
  totals: LineScoreSide;
}) {
  return (
    <tr>
      <th scope="row">{label}</th>
      {innings.map((inning) => (
        <td key={inning.inning}>{cell(inning[side].runs)}</td>
      ))}
      <td className="detail__linescore-total">{cell(totals.runs)}</td>
      <td className="detail__linescore-total">{cell(totals.hits)}</td>
      <td className="detail__linescore-total">{cell(totals.errors)}</td>
    </tr>
  );
}
