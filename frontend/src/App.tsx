import { useEffect, useMemo, useState } from 'react';
import type { Bracket } from '@mlb/shared';
import { isPredictable } from '@mlb/shared';
import { getBracket } from './api';
import { DEFAULT_SEASON, SELECTABLE_SEASONS } from './config';
import { BracketView } from './components/BracketView';
import { StandingsPanel } from './components/StandingsPanel';
import { PredictionPanel } from './components/PredictionPanel';
import brand from './assets/brand.svg';
import hero from './assets/hero.svg';

type BracketState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; bracket: Bracket; usedFallback: boolean };

/**
 * Whether a bracket has any "real" postseason content to render. A current
 * season (e.g. 2026) can return only placeholder/preview series that have not
 * started: every series is `scheduled` with no games played. In that case the
 * bracket is treated as upcoming/empty so the UI shows a friendly message
 * instead of a broken-looking grid.
 */
function hasStartedContent(bracket: Bracket): boolean {
  return bracket.series.some(
    (series) => series.status !== 'scheduled' || series.games.length > 0,
  );
}

export function App() {
  const [season, setSeason] = useState<number>(DEFAULT_SEASON);
  const [state, setState] = useState<BracketState>({ status: 'loading' });
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);

  const predictable = isPredictable(season);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
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
    setSelectedSeriesId(null);
    setSeason(nextSeason);
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
          <img src={brand} alt="MLB Postseason Pulse logo" width={52} height={52} />
          <div>
            <h1 className="app__title">MLB Postseason Pulse</h1>
            <p className="app__subtitle">
              {season} postseason bracket, standings, and{' '}
              {predictable ? 'AI predictions' : 'final results'}
            </p>
          </div>
        </div>
        <img className="app__hero" src={hero} alt="Baseball diamond at dusk" />
      </header>

      <nav className="app__seasons" aria-label="Select a postseason year">
        <span className="app__seasons-label" id="season-selector-label">
          Season
        </span>
        <div
          className="app__season-buttons"
          role="group"
          aria-labelledby="season-selector-label"
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
          Loading the {season} postseason&hellip;
        </p>
      )}

      {state.status === 'error' && (
        <p className="app__status app__status--error" role="alert">
          {state.message}
        </p>
      )}

      {state.status === 'ready' && !bracketStarted && (
        <p className="app__status app__status--upcoming" role="status">
          The {season} postseason has not started yet. Check back once the games
          begin.
        </p>
      )}

      {state.status === 'ready' && bracketStarted && (
        <>
          {state.usedFallback && (
            <p className="app__notice" role="status">
              Showing bundled offline data (the live API was unreachable).
            </p>
          )}
          <main className="app__main">
            <BracketView
              bracket={state.bracket}
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
                  aria-label="Final results"
                >
                  <h2 className="prediction__title">Final results</h2>
                  <p className="prediction__hint">
                    The {season} postseason is complete. Final results are shown
                    on the bracket; AI predictions are available only for the
                    current season.
                  </p>
                </section>
              )}
              <StandingsPanel bracket={state.bracket} />
            </aside>
          </main>
        </>
      )}

      <footer className="app__footer">
        <p>
          Data from the public MLB Stats API with bundled 2024 and 2025 seed
          fallbacks. Built for the Kiro University challenge.
        </p>
      </footer>
    </div>
  );
}
