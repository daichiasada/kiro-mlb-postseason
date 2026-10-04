import { useEffect, useMemo, useState } from 'react';
import type { Bracket } from '@mlb/shared';
import { getBracket } from './api';
import { DEFAULT_SEASON } from './config';
import { BracketView } from './components/BracketView';
import { StandingsPanel } from './components/StandingsPanel';
import { PredictionPanel } from './components/PredictionPanel';
import brand from './assets/brand.svg';
import hero from './assets/hero.svg';

type BracketState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; bracket: Bracket; usedFallback: boolean };

export function App() {
  const season = DEFAULT_SEASON;
  const [state, setState] = useState<BracketState>({ status: 'loading' });
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);

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

  const selectedSeries = useMemo(() => {
    if (state.status !== 'ready' || !selectedSeriesId) return null;
    return state.bracket.series.find((s) => s.id === selectedSeriesId) ?? null;
  }, [state, selectedSeriesId]);

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <img src={brand} alt="MLB Postseason Pulse logo" width={52} height={52} />
          <div>
            <h1 className="app__title">MLB Postseason Pulse</h1>
            <p className="app__subtitle">
              {season} postseason bracket, standings, and AI predictions
            </p>
          </div>
        </div>
        <img className="app__hero" src={hero} alt="Baseball diamond at dusk" />
      </header>

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

      {state.status === 'ready' && (
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
            />
            <aside className="app__aside">
              <PredictionPanel series={selectedSeries} season={season} />
              <StandingsPanel bracket={state.bracket} />
            </aside>
          </main>
        </>
      )}

      <footer className="app__footer">
        <p>
          Data from the public MLB Stats API with a bundled 2024 seed fallback.
          Built for the Kiro University challenge.
        </p>
      </footer>
    </div>
  );
}
