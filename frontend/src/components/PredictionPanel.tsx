import { useEffect, useState } from 'react';
import type { Prediction, PredictionResponse, Series } from '@mlb/shared';
import { getPrediction } from '../api';
import { teamName, useI18n, type TFn } from '../i18n';
import { TeamBadge } from './TeamBadge';

interface PredictionPanelProps {
  series: Series | null;
  season: number;
}

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; prediction: Prediction }
  | { status: 'upcoming'; message: string };

export function PredictionPanel({ series, season }: PredictionPanelProps) {
  const { t } = useI18n();
  const [state, setState] = useState<LoadState>({ status: 'idle' });

  useEffect(() => {
    if (!series) {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    getPrediction(series.id, season)
      .then((response: PredictionResponse) => {
        if (cancelled) return;
        if (response.mode === 'prediction') {
          setState({ status: 'success', prediction: response });
        } else {
          // 'upcoming' (and the defensive 'results' case) carry a human message
          // and no numeric prediction; show a graceful no-prediction state.
          setState({ status: 'upcoming', message: response.message });
        }
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
    <section className="prediction" aria-label={t('prediction.region')}>
      <h2 className="prediction__title">{t('prediction.title')}</h2>

      {state.status === 'idle' && (
        <p className="prediction__hint">{t('prediction.idleHint')}</p>
      )}

      {state.status === 'loading' && (
        <p className="prediction__loading" role="status">
          {t('prediction.loading')}
        </p>
      )}

      {state.status === 'upcoming' && (
        <p className="prediction__hint" role="status">
          {state.message}
        </p>
      )}

      {state.status === 'error' && (
        <p className="prediction__error" role="alert">
          {t('prediction.errorPrefix', { message: state.message })}
        </p>
      )}

      {state.status === 'success' && (
        <PredictionResult t={t} prediction={state.prediction} series={series} />
      )}
    </section>
  );
}

function PredictionResult({
  t,
  prediction,
  series,
}: {
  t: TFn;
  prediction: Prediction;
  series: Series | null;
}) {
  const percent = Math.round(prediction.favoriteWinProbability * 1000) / 10;
  const favoriteName = teamName(t, prediction.favoriteTeamId);
  const underdogId =
    series && series.high.teamId !== prediction.favoriteTeamId
      ? series.high.teamId
      : series?.low.teamId;

  return (
    <div className="prediction__result">
      <div className="prediction__favorite">
        <TeamBadge teamId={prediction.favoriteTeamId} size={44} />
        <div>
          <p className="prediction__favorite-label">
            {t('prediction.favorite')}
          </p>
          <p className="prediction__favorite-name">{favoriteName}</p>
        </div>
      </div>

      <div className="prediction__prob">
        <div className="prediction__prob-head">
          <span>{t('prediction.winProbability')}</span>
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
            {t('prediction.over', { team: teamName(t, underdogId) })}
          </p>
        )}
      </div>

      <p className="prediction__narrative">{prediction.narrative}</p>
      <p className="prediction__model">
        {t('prediction.model', { model: prediction.model })}
      </p>
    </div>
  );
}
