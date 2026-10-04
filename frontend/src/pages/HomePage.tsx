import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Bracket } from '@mlb/shared';
import { isPredictable } from '@mlb/shared';
import { getBracket } from '../api';
import { SELECTABLE_SEASONS } from '../config';
import { hasStartedContent, parseSeasonParam } from '../seasonRoute';
import { BracketView } from '../components/BracketView';
import { StandingsPanel } from '../components/StandingsPanel';
import { PredictionPanel } from '../components/PredictionPanel';
import { LanguageToggle } from '../components/LanguageToggle';
import { useI18n } from '../i18n';
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
 */
export function HomePage() {
  const params = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const season = parseSeasonParam(params.season);

  const [state, setState] = useState<BracketState>({ status: 'loading' });
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);

  const predictable = isPredictable(season);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    setSelectedSeriesId(null);
    getBracket(season)
      .then(({ bracket, usedFallback }) => {
        if (!cancelled) setState({ status: 'ready', bracket, usedFallback });
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
        <LanguageToggle />
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
