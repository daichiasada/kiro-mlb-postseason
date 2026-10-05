import { useId, useState, type KeyboardEvent, type Ref } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Bracket, Series, SeriesTeam } from '@mlb/shared';
import { TeamBadge } from './TeamBadge';
import { FavoriteToggle } from './FavoriteToggle';
import { useFavorites } from '../FavoritesContext';
import { clinchWins, isTeamEliminated, seriesLeaderId } from '../bracketLayout';
import {
  roundName,
  statusLabel,
  teamAbbr,
  teamName,
  useI18n,
  type TFn,
  type Lang,
} from '../i18n';
import type { GameResult } from '@mlb/shared';
import { formatStartTime, resolveTimeZone } from '../gameTime';
import { buildIcs } from '../ics';

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
  /**
   * Roving-tabindex value for the card <article>: `0` for the single active
   * (roving) card, `-1` for every other card. Defaults to `0` when the card is
   * used standalone (e.g. in isolation tests) so it stays reachable.
   */
  tabIndex?: number;
  /**
   * The full bracket this series belongs to. Optional; when provided it is used
   * to decide whether a favorite team in this series has been eliminated (lost
   * a FINAL series elsewhere in the bracket), so the card can show a localized
   * "Eliminated" treatment. When omitted (e.g. isolation tests), the card falls
   * back to this series alone.
   */
  bracket?: Bracket;
  /** Ref to the card <article> so the bracket can move focus programmatically. */
  cardRef?: Ref<HTMLElement>;
  /**
   * Arrow-key handler owned by the bracket (it knows the 2D column/row layout).
   * Receives the raw event so the bracket can move the roving focus. Enter/Space
   * activation is handled inside the card itself.
   */
  onCardKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
}

function TeamRow({
  t,
  team,
  isLeader,
  isWinner,
  eliminated,
}: {
  t: TFn;
  team: SeriesTeam;
  isLeader: boolean;
  isWinner: boolean;
  /** True when this team (a favorite) has been eliminated from the bracket. */
  eliminated: boolean;
}) {
  const classes = ['series-team'];
  if (isWinner) classes.push('series-team--winner');
  else if (isLeader) classes.push('series-team--leader');

  return (
    <div className={classes.join(' ')}>
      <TeamBadge teamId={team.teamId} size={32} />
      <span className="series-team__name">{teamName(t, team.teamId)}</span>
      {eliminated && (
        <span className="series-team__eliminated" data-team-id={team.teamId}>
          {t('favorites.eliminated')}
        </span>
      )}
      <span className="series-team__wins">{team.wins}</span>
      <FavoriteToggle teamId={team.teamId} />
    </div>
  );
}

/**
 * Triggers a purely client-side download of an `.ics` file built from a game.
 * No network call: the VEVENT text is wrapped in a `text/calendar` Blob, an
 * object URL is created, a transient anchor is clicked, then the URL is
 * revoked. Guarded so a non-browser/jsdom environment (no URL.createObjectURL)
 * is a no-op rather than a throw.
 */
function downloadIcs(filename: string, ics: string): void {
  if (
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function' ||
    typeof document === 'undefined'
  ) {
    return;
  }
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * A single game row inside the collapsible games list: the compact score line,
 * the first-pitch time rendered in the viewer's local zone (or a localized
 * "Time TBD"), and - only for a timed game - an "Add to calendar" control that
 * downloads a client-side `.ics`. The control is omitted for a TBD/undefined
 * start since there is no concrete instant to put in the event.
 */
function GameRow({
  t,
  lang,
  game,
  matchup,
  timeZone,
}: {
  t: TFn;
  lang: Lang;
  game: GameResult;
  matchup: string;
  timeZone: string;
}) {
  const localTime = formatStartTime(game.startTime, {
    lang,
    timeZone,
    timeTbd: game.timeTbd,
    tbdLabel: t('gametime.tbd'),
  });
  const isTimed = game.startTime !== undefined && game.timeTbd !== true;

  function handleAddToCalendar() {
    if (game.startTime === undefined) return;
    const ics = buildIcs({
      uid: `mlb-game-${game.gamePk}@mlb-postseason`,
      start: game.startTime,
      summary: matchup,
      description: matchup,
    });
    downloadIcs(`mlb-game-${game.gamePk}.ics`, ics);
  }

  return (
    <li className="series-card__game">
      <span className="series-card__game-num">G{game.seriesGameNumber}</span>
      <span className="series-card__game-score">
        {teamAbbr(t, game.away.teamId)} {game.away.score ?? '-'} @{' '}
        {teamAbbr(t, game.home.teamId)} {game.home.score ?? '-'}
      </span>
      <span className="series-card__game-time">{localTime}</span>
      {isTimed && (
        <button
          type="button"
          className="series-card__game-ics"
          onClick={handleAddToCalendar}
          aria-label={t('ics.ariaLabel', { matchup, time: localTime })}
        >
          {t('ics.add')}
        </button>
      )}
    </li>
  );
}

export function SeriesCard({
  series,
  season,
  selected = false,
  onSelect,
  predictable = true,
  tabIndex = 0,
  bracket,
  cardRef,
  onCardKeyDown,
}: SeriesCardProps) {
  const { t, lang } = useI18n();
  const { isFavorite } = useFavorites();
  const navigate = useNavigate();
  const timeZone = resolveTimeZone();
  const matchup = `${teamName(t, series.high.teamId)} ${t('series.vsLabel')} ${teamName(t, series.low.teamId)}`;
  const leaderId = seriesLeaderId(series);
  const needed = clinchWins(series.bestOf);
  const isFinal = series.status === 'final';
  const hasGames = series.games.length > 0;

  // Favorite highlight (Issue #18): a series is highlighted when either of its
  // teams is a favorite. The visual cue is NOT color-only - a star icon marker
  // in the header plus a distinct border/outline (see styles.css) - and a
  // visually-hidden label announces it to screen readers via favorites.marker.
  const highIsFavorite = isFavorite(series.high.teamId);
  const lowIsFavorite = isFavorite(series.low.teamId);
  const isFavoriteSeries = highIsFavorite || lowIsFavorite;
  // Elimination is derived over the whole bracket when available (a team is
  // eliminated by losing a FINAL series anywhere), falling back to this single
  // series in isolation. Only surfaced for a favorited team.
  const eliminationScope: Bracket = bracket ?? {
    season,
    updatedAt: '',
    series: [series],
  };
  const highEliminated =
    highIsFavorite && isTeamEliminated(eliminationScope, series.high.teamId);
  const lowEliminated =
    lowIsFavorite && isTeamEliminated(eliminationScope, series.low.teamId);

  const detailPath = `/season/${season}/series/${encodeURIComponent(series.id)}`;
  // The card can be activated for prediction only when the mouse affordance
  // would also appear (predictable, non-final, with an onSelect handler).
  const canPredict = Boolean(onSelect) && predictable && !isFinal;

  /**
   * Keyboard model on the card <article>:
   *  - Enter/Space activates the card (open detail for a FINAL series, or
   *    select a predictable series) mirroring the mouse affordance.
   *  - Arrow/Home/End keys are delegated to the bracket's roving handler.
   * Events that originate on an inner control (the toggle button, detail link,
   * or predict button) are ignored so those keep their native behavior and the
   * card never double-fires.
   *
   * Intentional keyboard/mouse asymmetry: the card <article> is deliberately
   * keyboard-activatable (it holds the roving tabindex, so Enter/Space is the
   * keyboard user's single entry point to the same destination the visible
   * controls reach). Mouse users are NOT given a card-body click handler on
   * purpose: they click the explicit inner "View detail" link (final series)
   * or "Predict winner" button (predictable series), which stay the sole,
   * unambiguous pointer targets. Adding a card-body onClick would risk
   * double-activating alongside those inner controls and muddy the hit target,
   * so the two activation paths (keyboard = whole card, mouse = inner control)
   * are kept distinct by design.
   *
   * Focusable-but-inert state: a card that is neither final nor predictable
   * (canPredict === false) still carries a roving tabindex, so it is focusable
   * yet Enter/Space is a no-op. In practice this means an in-progress series in
   * a results-only (non-predictable, i.e. past) season. On a current/predictable
   * season every non-final card is selectable, and historical brackets are
   * final, so this state is effectively unreachable on a rendered bracket; the
   * no-op is the correct fallback rather than dead UI if such data ever appears.
   */
  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      if (isFinal) {
        event.preventDefault();
        navigate(detailPath);
        return;
      }
      if (canPredict) {
        event.preventDefault();
        onSelect?.(series.id);
        return;
      }
      return;
    }
    onCardKeyDown?.(event);
  }

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
  if (isFavoriteSeries) classes.push('series-card--favorite');

  return (
    <article
      ref={cardRef}
      className={classes.join(' ')}
      data-series-id={series.id}
      tabIndex={tabIndex}
      onKeyDown={handleKeyDown}
      aria-label={t('series.cardLabel', {
        high: teamName(t, series.high.teamId),
        low: teamName(t, series.low.teamId),
        status: statusLabel(t, series.status),
        bestOf: series.bestOf,
        highWins: series.high.wins,
        lowWins: series.low.wins,
      })}
    >
      <header className="series-card__header">
        <span className="series-card__round">{roundName(t, series.round)}</span>
        {isFavoriteSeries && (
          <span className="series-card__favorite-marker" data-testid="favorite-marker">
            {/* Non-color cue: a star ICON (shape) alongside the border/outline
                treatment on the card. The accessible text is visually hidden
                but announced to assistive tech. */}
            <svg
              className="series-card__favorite-icon"
              width={14}
              height={14}
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.9l-5.8 3.05 1.11-6.46-4.7-4.58 6.49-.94L12 2.5z"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
            <span className="sr-only">{t('favorites.marker')}</span>
          </span>
        )}
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
          eliminated={highEliminated}
        />
        <TeamRow
          t={t}
          team={series.low}
          isLeader={leaderId === series.low.teamId}
          isWinner={isFinal && series.low.wins >= needed}
          eliminated={lowEliminated}
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
              <GameRow
                key={game.gamePk}
                t={t}
                lang={lang}
                game={game}
                matchup={matchup}
                timeZone={timeZone}
              />
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
        <Link className="series-card__detail-link" to={detailPath}>
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
