import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Bracket } from '@mlb/shared';
import { isPredictable } from '@mlb/shared';
import { getBracket } from '../api';
import { POLL_INTERVAL_MS, SELECTABLE_SEASONS } from '../config';
import { hasStartedContent, parseSeasonParam } from '../seasonRoute';
import { BracketView } from '../components/BracketView';
import { StandingsPanel } from '../components/StandingsPanel';
import { PredictionPanel } from '../components/PredictionPanel';
import { LanguageToggle } from '../components/LanguageToggle';
import { ThemeToggle } from '../components/ThemeToggle';
import { useI18n } from '../i18n';
import { formatRelativeTime } from '../relativeTime';
import { AUTO_REFRESH_INTERVAL_MS, useAutoRefresh } from '../useAutoRefresh';
import brand from '../assets/brand.svg';
import hero from '../assets/hero.svg';

type BracketState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; bracket: Bracket; usedFallback: boolean };

/**
 * The bracket landing page for a single season.
 *
 * The season is driven by the `:season` route param (so the view is
 * deep-linkable and the selection survives navigation). Choosing another
 * season navigates to `/season/:year`; selecting a series to predict is local
 * state (the prediction panel is only shown for predictable seasons).
 *
 * While a season is in progress the page refreshes the bracket in the
 * background (see {@link useAutoRefresh}). Background refreshes never swap the
 * UI back to the full 'loading' screen and never reset the selected series, so
 * they are flicker-free: the bracket stays mounted, scroll position is kept,
 * and a failed refresh keeps the previously loaded data while surfacing an
 * unobtrusive inline notice (Issue #17).
 */
export function HomePage() {
  const params = useParams();
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const season = parseSeasonParam(params.season);

  const [state, setState] = useState<BracketState>({ status: 'loading' });
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  // Bumped on each successful refresh and on a lightweight timer so the
  // relative "last updated" label advances without a manual reload.
  const [now, setNow] = useState(() => new Date());

  const predictable = isPredictable(season);

  // Keep the current season in a ref so an in-flight background refresh that
  // resolves AFTER the user switched seasons is ignored (stale guard).
  const seasonRef = useRef(season);
  seasonRef.current = season;

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    setSelectedSeriesId(null);
    setRefreshError(null);
    setIsRefreshing(false);
    getBracket(season)
      .then(({ bracket, usedFallback }) => {
        if (!cancelled) {
          setState({ status: 'ready', bracket, usedFallback });
          setNow(new Date());
        }
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

  /**
   * Background refresh: re-fetch the bracket WITHOUT dropping to the 'loading'
   * state and WITHOUT resetting the selected series. On success it swaps in the
   * new bracket and clears any prior refresh error; on failure it keeps the
   * existing bracket and records a localized inline error.
   */
  const refresh = useCallback(() => {
    const requestedSeason = seasonRef.current;
    setIsRefreshing(true);
    getBracket(requestedSeason)
      .then(({ bracket, usedFallback }) => {
        // Ignore a resolved refresh whose season no longer matches.
        if (seasonRef.current !== requestedSeason) return;
        setState({ status: 'ready', bracket, usedFallback });
        setRefreshError(null);
        setNow(new Date());
      })
      .catch(() => {
        if (seasonRef.current !== requestedSeason) return;
        // Keep the previously loaded bracket; surface the error unobtrusively.
        setRefreshError(t('refresh.error'));
      })
      .finally(() => {
        if (seasonRef.current !== requestedSeason) return;
        setIsRefreshing(false);
      });
  }, [t]);

  function handleSeasonChange(nextSeason: number) {
    if (nextSeason === season) return;
    navigate(`/season/${nextSeason}`);
  }

  const selectedSeries = useMemo(() => {
    if (state.status !== 'ready' || !selectedSeriesId) return null;
    return state.bracket.series.find((s) => s.id === selectedSeriesId) ?? null;
  }, [state, selectedSeriesId]);

  const bracketStarted =
    state.status === 'ready' && hasStartedContent(state.bracket);

  // Poll ONLY when the season is predictable, the bracket is loaded, and it
  // currently has an in-progress series. Past/results-only seasons and
  // predictable seasons with no live series never start the interval.
  const hasInProgressSeries =
    state.status === 'ready' &&
    state.bracket.series.some((s) => s.status === 'in_progress');
  const pollingEnabled = predictable && hasInProgressSeries;

  useAutoRefresh({
    enabled: pollingEnabled,
    // Production always polls every AUTO_REFRESH_INTERVAL_MS (60s); the e2e
    // suite injects a much shorter interval via VITE_AUTO_REFRESH_INTERVAL_MS
    // so it can actually observe (or prove the absence of) a tick.
    intervalMs: POLL_INTERVAL_MS,
    onRefresh: refresh,
  });

  // Advance the relative "last updated" label roughly once a minute while a
  // bracket is shown, so "n minutes ago" / "n分前" stays current.
  useEffect(() => {
    if (state.status !== 'ready') return;
    const id = setInterval(() => setNow(new Date()), AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [state.status]);

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <img src={brand} alt={t('app.logoAlt')} width={52} height={52} />
          <div>
            <h1 className="app__title">{t('app.title')}</h1>
            <p className="app__subtitle">
              {t(
                predictable
                  ? 'app.subtitle.predictions'
                  : 'app.subtitle.results',
                { season },
              )}
            </p>
          </div>
        </div>
        <div className="app__controls">
          <ThemeToggle />
          <LanguageToggle />
        </div>
        <Link className="app__accuracy-link" to="/accuracy">
          {t('accuracy.nav')}
        </Link>
        <img className="app__hero" src={hero} alt={t('app.heroAlt')} />
      </header>

      <nav className="app__seasons" aria-label={t('app.season')}>
        <span className="app__seasons-label" id="season-selector-label">
          {t('app.season')}
        </span>
        <div
          className="app__season-buttons"
          role="group"
          aria-labelledby="season-selector-label"
          data-testid="season-group"
        >
          {SELECTABLE_SEASONS.map((year) => (
            <button
              key={year}
              type="button"
              className={
                'app__season-button' +
                (year === season ? ' app__season-button--active' : '')
              }
              aria-pressed={year === season}
              onClick={() => handleSeasonChange(year)}
            >
              {year}
            </button>
          ))}
        </div>
      </nav>

      {state.status === 'loading' && (
        <p className="app__status" role="status">
          {t('app.loading', { season })}
        </p>
      )}

      {state.status === 'error' && (
        <p className="app__status app__status--error" role="alert">
          {state.message}
        </p>
      )}

      {state.status === 'ready' && !bracketStarted && (
        <p className="app__status app__status--upcoming" role="status">
          {t('app.notStarted', { season })}
        </p>
      )}

      {state.status === 'ready' && bracketStarted && (
        <>
          <div className="app__refresh" data-testid="refresh-bar">
            <span className="app__refresh-updated" role="status">
              {t('refresh.lastUpdated', {
                relative: formatRelativeTime(state.bracket.updatedAt, now, lang),
              })}
            </span>
            <button
              type="button"
              className="app__refresh-button"
              onClick={refresh}
              disabled={isRefreshing}
              aria-busy={isRefreshing}
            >
              {isRefreshing ? t('refresh.updating') : t('refresh.button')}
            </button>
          </div>
          {refreshError && (
            <p className="app__notice app__notice--refresh" role="status">
              {refreshError}
            </p>
          )}
          {state.usedFallback && (
            <p className="app__notice" role="status">
              {t('app.offlineNotice')}
            </p>
          )}
          {(state.bracket.integrityWarnings?.length ?? 0) > 0 && (
            <p className="app__notice app__notice--integrity" role="status">
              {t('integrity.banner', {
                count: state.bracket.integrityWarnings!.length,
              })}
            </p>
          )}
          <main className="app__main">
            <BracketView
              bracket={state.bracket}
              season={season}
              selectedSeriesId={selectedSeriesId}
              onSelectSeries={setSelectedSeriesId}
              predictable={predictable}
            />
            <aside className="app__aside">
              {predictable ? (
                <PredictionPanel series={selectedSeries} season={season} />
              ) : (
                <section
                  className="prediction prediction--results"
                  aria-label={t('results.title')}
                >
                  <h2 className="prediction__title">{t('results.title')}</h2>
                  <p className="prediction__hint">
                    {t('results.hint', { season })}
                  </p>
                </section>
              )}
              <StandingsPanel bracket={state.bracket} />
            </aside>
          </main>
        </>
      )}

      <footer className="app__footer">
        <p>{t('app.footer')}</p>
      </footer>
    </div>
  );
}
