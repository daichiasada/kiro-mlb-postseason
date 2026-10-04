import { useEffect, useState } from 'react';
import { TEAMS } from '@mlb/shared';
import type { Prediction, Series } from '@mlb/shared';
import { getPrediction } from '../api';
import { TeamBadge } from './TeamBadge';

interface PredictionPanelProps {
  series: Series | null;
  season: number;
}

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; prediction: Prediction };

function teamName(teamId: number): string {
  return TEAMS[teamId]?.name ?? `Team ${teamId}`;
}

export function PredictionPanel({ series, season }: PredictionPanelProps) {
  const [state, setState] = useState<LoadState>({ status: 'idle' });

  useEffect(() => {
    if (!series) {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    getPrediction(series.id, season)
      .then((prediction) => {
        if (!cancelled) setState({ status: 'success', prediction });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : 'Prediction failed';
          setState({ status: 'error', message });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [series, season]);

  return (
    <section className="prediction" aria-label="Win/loss prediction">
      <h2 className="prediction__title">AI Prediction</h2>

      {state.status === 'idle' && (
        <p className="prediction__hint">
          Select a series from the bracket to see an AI-generated win/loss
          prediction.
        </p>
      )}

      {state.status === 'loading' && (
        <p className="prediction__loading" role="status">
          Generating prediction&hellip;
        </p>
      )}

      {state.status === 'error' && (
        <p className="prediction__error" role="alert">
          Could not load prediction: {state.message}
        </p>
      )}

      {state.status === 'success' && (
        <PredictionResult prediction={state.prediction} series={series} />
      )}
    </section>
  );
}

function PredictionResult({
  prediction,
  series,
}: {
  prediction: Prediction;
  series: Series | null;
}) {
  const percent = Math.round(prediction.favoriteWinProbability * 1000) / 10;
  const favoriteName = teamName(prediction.favoriteTeamId);
  const underdogId =
    series && series.high.teamId !== prediction.favoriteTeamId
      ? series.high.teamId
      : series?.low.teamId;

  return (
    <div className="prediction__result">
      <div className="prediction__favorite">
        <TeamBadge teamId={prediction.favoriteTeamId} size={44} />
        <div>
          <p className="prediction__favorite-label">Favorite</p>
          <p className="prediction__favorite-name">{favoriteName}</p>
        </div>
      </div>

      <div className="prediction__prob">
        <div className="prediction__prob-head">
          <span>Win probability</span>
          <span className="prediction__prob-value">{percent.toFixed(1)}%</span>
        </div>
        <div
          className="prediction__bar"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${favoriteName} win probability`}
        >
          <div className="prediction__bar-fill" style={{ width: `${percent}%` }} />
        </div>
        {underdogId !== undefined && (
          <p className="prediction__underdog">
            over {teamName(underdogId)}
          </p>
        )}
      </div>

      <p className="prediction__narrative">{prediction.narrative}</p>
      <p className="prediction__model">Model: {prediction.model}</p>
    </div>
  );
}
