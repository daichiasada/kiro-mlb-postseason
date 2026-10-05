import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  runBacktestAcrossAccuracies,
  runMultiSeasonBacktest,
  type BacktestResult,
  type CalibrationBin,
} from '@mlb/shared';
import { DEFAULT_SEASON } from '../config';
import { useI18n } from '../i18n';
import { LanguageToggle } from '../components/LanguageToggle';
import { ThemeToggle } from '../components/ThemeToggle';
import brand from '../assets/brand.svg';

/**
 * The accuracy settings compared on the page. Fixed and deterministic so the
 * table and tests are stable; mirrors the shared engine's default sweep.
 */
const ACCURACY_SWEEP = [0, 0.25, 0.5, 0.75, 1] as const;

/** The accuracy the per-bucket calibration display is rendered for. */
const CALIBRATION_ACCURACY = 0.5;

/** The seasons the backtest replays (bundled seed data). */
const BACKTEST_SEASONS = [2024, 2025] as const;

/** Format a 0..1 metric as a 1-decimal percentage (e.g. 0.822222 -> "82.2%"). */
function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** Format a Brier score with three decimals (lower is better, 0 perfect). */
function formatBrier(value: number): string {
  return value.toFixed(3);
}

/** Format an accuracy setting (0..1) compactly. */
function formatAccuracy(value: number): string {
  return value.toFixed(2);
}

/** Format a probability bucket edge as a percentage with no decimals. */
function formatEdge(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * The client-side Model accuracy / backtest page.
 *
 * Everything is computed in a {@link useMemo} by replaying the bundled seed
 * brackets through the PURE `@mlb/shared` backtest engine. There is no backend
 * endpoint, no network request, and no Amazon Bedrock involvement, so the page
 * is fully deterministic (Issue #16 criterion 3). The metric definitions are
 * rendered in the UI (criterion 2) and localized EN/JA.
 */
export function AccuracyPage() {
  const { t } = useI18n();

  const { sweep, calibrationBins, calibrationResult } = useMemo(() => {
    const sweep = runBacktestAcrossAccuracies([...ACCURACY_SWEEP], [
      ...BACKTEST_SEASONS,
    ]);
    const calibrationRun = runMultiSeasonBacktest(CALIBRATION_ACCURACY, [
      ...BACKTEST_SEASONS,
    ]);
    return {
      sweep,
      calibrationBins: calibrationRun.combined.calibrationBins,
      calibrationResult: calibrationRun.combined,
    };
  }, []);

  const accuracyList = ACCURACY_SWEEP.map(formatAccuracy).join(', ');

  /** The three per-season/combined results for one accuracy row. */
  function rowsFor(accuracy: number): Array<{
    key: string;
    label: string;
    result: BacktestResult;
  }> {
    const entry = sweep.find((s) => s.accuracy === accuracy)!;
    return [
      { key: '2024', label: '2024', result: entry.perSeason[2024]! },
      { key: '2025', label: '2025', result: entry.perSeason[2025]! },
      {
        key: 'combined',
        label: t('accuracy.season.combined'),
        result: entry.combined,
      },
    ];
  }

  const maxBucketCount = Math.max(
    1,
    ...calibrationBins.map((b) => b.predictedCount),
  );

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <img src={brand} alt={t('app.logoAlt')} width={52} height={52} />
          <div>
            <h1 className="app__title">{t('accuracy.pageTitle')}</h1>
            <p className="app__subtitle">{t('accuracy.nav')}</p>
          </div>
        </div>
        <div className="app__controls">
          <ThemeToggle />
          <LanguageToggle />
        </div>
      </header>

      <nav className="app__seasons" aria-label={t('accuracy.backToBracket')}>
        <Link className="detail__back" to={`/season/${DEFAULT_SEASON}`}>
          {t('accuracy.backToBracket')}
        </Link>
      </nav>

      <main className="app__main">
        <section
          className="accuracy"
          aria-label={t('accuracy.region')}
          data-testid="accuracy-page"
        >
          <p className="accuracy__intro">{t('accuracy.intro')}</p>
          <p className="accuracy__methodology">{t('accuracy.methodology')}</p>
          <p className="accuracy__caveat" role="note">
            {t('accuracy.decidingGameCaveat')}
          </p>

          {/* (2) Metric definitions, localized. */}
          <section
            className="accuracy__definitions"
            aria-label={t('accuracy.definitionsTitle')}
          >
            <h2>{t('accuracy.definitionsTitle')}</h2>
            <dl className="accuracy__def-list">
              <dt>{t('accuracy.metric.hitRate')}</dt>
              <dd>{t('accuracy.metric.hitRate.def')}</dd>
              <dt>{t('accuracy.metric.brier')}</dt>
              <dd>{t('accuracy.metric.brier.def')}</dd>
              <dt>{t('accuracy.metric.calibration')}</dt>
              <dd>{t('accuracy.metric.calibration.def')}</dd>
            </dl>
          </section>

          {/* (3) Comparison across accuracy settings. */}
          <section
            className="accuracy__comparison"
            aria-label={t('accuracy.sliderCompareTitle')}
            data-testid="accuracy-comparison"
          >
            <h2>{t('accuracy.sliderCompareTitle')}</h2>
            <table className="accuracy__table">
              <caption className="accuracy__caption">
                {t('accuracy.sliderCompareSummary', {
                  accuracies: accuracyList,
                })}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{t('accuracy.table.accuracy')}</th>
                  <th scope="col">{t('accuracy.table.season')}</th>
                  <th scope="col">{t('accuracy.metric.hitRate')}</th>
                  <th scope="col">{t('accuracy.metric.brier')}</th>
                  <th scope="col">{t('accuracy.table.sampleCount')}</th>
                </tr>
              </thead>
              <tbody>
                {ACCURACY_SWEEP.map((accuracy) =>
                  rowsFor(accuracy).map((row, index) => (
                    <tr key={`${accuracy}-${row.key}`}>
                      {index === 0 && (
                        <th scope="row" rowSpan={3}>
                          {formatAccuracy(accuracy)}
                        </th>
                      )}
                      <td>{row.label}</td>
                      <td data-testid={`hitRate-${accuracy}-${row.key}`}>
                        {formatPercent(row.result.hitRate)}
                      </td>
                      <td data-testid={`brier-${accuracy}-${row.key}`}>
                        {formatBrier(row.result.brierScore)}
                      </td>
                      <td>{row.result.sampleCount}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </section>

          {/* (4) Calibration display with accessible text. */}
          <section
            className="accuracy__calibration"
            aria-label={t('accuracy.calibrationTitle', {
              accuracy: formatAccuracy(CALIBRATION_ACCURACY),
            })}
            data-testid="accuracy-calibration"
          >
            <h2>
              {t('accuracy.calibrationTitle', {
                accuracy: formatAccuracy(CALIBRATION_ACCURACY),
              })}
            </h2>
            <p className="accuracy__caption">
              {t('accuracy.calibrationSummary', {
                accuracy: formatAccuracy(CALIBRATION_ACCURACY),
              })}
            </p>
            <ul className="accuracy__bars" role="list">
              {calibrationBins.map((bin: CalibrationBin, i) => {
                const lower = formatEdge(bin.lowerInclusive);
                const upper = formatEdge(bin.upperExclusive);
                const predicted =
                  bin.meanPredictedProbability === null
                    ? t('accuracy.calibration.empty')
                    : formatPercent(bin.meanPredictedProbability);
                const empirical =
                  bin.empiricalWinRate === null
                    ? t('accuracy.calibration.empty')
                    : formatPercent(bin.empiricalWinRate);
                const label = t('accuracy.calibration.binLabel', {
                  lower,
                  upper,
                  count: bin.predictedCount,
                  predicted,
                  empirical,
                });
                const widthPct = (bin.predictedCount / maxBucketCount) * 100;
                const empiricalWidth =
                  bin.empiricalWinRate === null
                    ? 0
                    : bin.empiricalWinRate * 100;
                return (
                  <li
                    key={i}
                    className="accuracy__bar-row"
                    aria-label={label}
                    data-testid={`calibration-bin-${i}`}
                  >
                    <span className="accuracy__bar-bucket" aria-hidden="true">
                      {lower}–{upper}
                    </span>
                    <span
                      className="accuracy__bar-track"
                      aria-hidden="true"
                      style={{
                        display: 'inline-block',
                        width: '120px',
                        background: '#e2e8f0',
                      }}
                    >
                      <span
                        className="accuracy__bar-fill"
                        style={{
                          display: 'inline-block',
                          width: `${widthPct}%`,
                          height: '0.75rem',
                          background: '#2563eb',
                        }}
                      />
                    </span>
                    <span className="accuracy__bar-meta" aria-hidden="true">
                      {t('accuracy.calibration.count')}: {bin.predictedCount} ·{' '}
                      {t('accuracy.calibration.predicted')}: {predicted} ·{' '}
                      {t('accuracy.calibration.empirical')}: {empirical}
                    </span>
                    {/* Keep a hidden empirical width hint for completeness. */}
                    <span className="accuracy__sr-only" data-empirical-width={empiricalWidth} />
                  </li>
                );
              })}
            </ul>
            <p className="accuracy__caption">
              {t('accuracy.table.sampleCount')}:{' '}
              {calibrationResult.sampleCount}
            </p>
          </section>
        </section>
      </main>

      <footer className="app__footer">
        <p>{t('app.footer')}</p>
      </footer>
    </div>
  );
}
