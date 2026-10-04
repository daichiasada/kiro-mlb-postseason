import { useEffect, useId, useState } from 'react';
import type { Prediction, PredictionResponse, Series } from '@mlb/shared';
import { DEFAULT_NARRATIVE_MODEL_ID, NARRATIVE_MODEL_OPTIONS } from '@mlb/shared';
import { getPrediction } from '../api';
import {
  ACCURACY_STEP,
  DEFAULT_ACCURACY,
  MAX_ACCURACY,
  MIN_ACCURACY,
} from '../config';
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

/** Debounce window (ms) for re-requesting while dragging the slider. */
const ACCURACY_DEBOUNCE_MS = 300;

export function PredictionPanel({ series, season }: PredictionPanelProps) {
  const { t, lang } = useI18n();
  const [state, setState] = useState<LoadState>({ status: 'idle' });
  // The model-accuracy control. Defaults to the backend's DEFAULT_ACCURACY so
  // the initial request/behavior is unchanged.
  const [accuracy, setAccuracy] = useState<number>(DEFAULT_ACCURACY);
  // The accuracy actually used for the in-flight/last request. Debounced from
  // `accuracy` so dragging the slider does not fire a request per pixel.
  const [requestedAccuracy, setRequestedAccuracy] =
    useState<number>(DEFAULT_ACCURACY);
  // The selected Bedrock model id. Defaults to the shared default; a discrete
  // <select> so changing it re-fetches immediately (no debounce needed).
  const [model, setModel] = useState<string>(DEFAULT_NARRATIVE_MODEL_ID);

  // Debounce the slider -> request accuracy transition.
  useEffect(() => {
    if (accuracy === requestedAccuracy) return;
    const handle = setTimeout(() => {
      setRequestedAccuracy(accuracy);
    }, ACCURACY_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [accuracy, requestedAccuracy]);

  useEffect(() => {
    if (!series) {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    getPrediction(series.id, season, requestedAccuracy, lang, model)
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
    // `lang` and `model` are request inputs: toggling the language re-generates
    // the narrative in the new language, and picking a model re-requests with it.
  }, [series, season, requestedAccuracy, lang, model]);

  // The accuracy control is only meaningful while a series is selected and a
  // numeric prediction is being shown or fetched (not idle/upcoming/results).
  const showAccuracyControl =
    series !== null &&
    (state.status === 'loading' ||
      state.status === 'success' ||
      state.status === 'error');

  return (
    <section className="prediction" aria-label={t('prediction.region')}>
      <h2 className="prediction__title">{t('prediction.title')}</h2>

      {state.status === 'idle' && (
        <p className="prediction__hint">{t('prediction.idleHint')}</p>
      )}

      {showAccuracyControl && (
        <>
          <AccuracyControl
            t={t}
            value={accuracy}
            onChange={setAccuracy}
          />
          <ModelControl t={t} value={model} onChange={setModel} />
        </>
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

/**
 * The accessible, localized model-accuracy slider. A labeled range input in
 * [0, 1] stepping by {@link ACCURACY_STEP}; the current value is shown next to
 * the label and help text explains the semantics.
 */
function AccuracyControl({
  t,
  value,
  onChange,
}: {
  t: TFn;
  value: number;
  onChange: (next: number) => void;
}) {
  const inputId = useId().replace(/:/g, '');
  const helpId = `${inputId}-help`;
  const display = value.toFixed(2);

  return (
    <div className="prediction__accuracy">
      <div className="prediction__accuracy-head">
        <label className="prediction__accuracy-label" htmlFor={inputId}>
          {t('prediction.accuracy.label')}
        </label>
        <span className="prediction__accuracy-value" aria-hidden="true">
          {display}
        </span>
      </div>
      <input
        id={inputId}
        className="prediction__accuracy-slider"
        type="range"
        min={MIN_ACCURACY}
        max={MAX_ACCURACY}
        step={ACCURACY_STEP}
        value={value}
        aria-describedby={helpId}
        aria-valuetext={t('prediction.accuracy.value', { value: display })}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="prediction__accuracy-ends" aria-hidden="true">
        <span>{t('prediction.accuracy.conservative')}</span>
        <span>{t('prediction.accuracy.aggressive')}</span>
      </div>
      <p id={helpId} className="prediction__accuracy-help">
        {t('prediction.accuracy.help')}
      </p>
    </div>
  );
}

/**
 * The accessible, localized AI-model selector. A labeled `<select>` listing the
 * shared {@link NARRATIVE_MODEL_OPTIONS} (Amazon Nova micro/lite/pro plus the
 * Anthropic Claude option); choosing one threads the model id onto the next
 * prediction request. Option display names are the shared, brand labels (shown
 * as-is in both languages, like club names), while the control label is
 * localized.
 */
function ModelControl({
  t,
  value,
  onChange,
}: {
  t: TFn;
  value: string;
  onChange: (next: string) => void;
}) {
  const selectId = useId().replace(/:/g, '');

  return (
    <div className="prediction__model-control">
      <label className="prediction__model-label" htmlFor={selectId}>
        {t('prediction.model.selectLabel')}
      </label>
      <select
        id={selectId}
        className="prediction__model-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {NARRATIVE_MODEL_OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
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
