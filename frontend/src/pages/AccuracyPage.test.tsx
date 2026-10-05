import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AccuracyPage } from './AccuracyPage';
import { I18nProvider } from '../i18n';
import type { Lang } from '../i18n';

/** Render the AccuracyPage at /accuracy in the given language. */
function renderAccuracy(lang: Lang) {
  return render(
    <MemoryRouter initialEntries={['/accuracy']}>
      <I18nProvider initialLang={lang}>
        <AccuracyPage />
      </I18nProvider>
    </MemoryRouter>,
  );
}

describe('AccuracyPage (Issue #16)', () => {
  it('renders a region landmark with the three metric sections (EN)', () => {
    renderAccuracy('en');

    expect(
      screen.getByRole('region', { name: /model accuracy and backtest results/i }),
    ).toBeInTheDocument();

    // Metric definition section terms (appear at least once; also used as
    // table column headers, so there may be more than one occurrence).
    expect(screen.getAllByText('Hit rate').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Brier score').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Calibration').length).toBeGreaterThan(0);

    // The comparison and calibration sections are present.
    expect(screen.getByTestId('accuracy-comparison')).toBeInTheDocument();
    expect(screen.getByTestId('accuracy-calibration')).toBeInTheDocument();
  });

  it('shows the localized Brier and calibration definition text (criterion 2)', () => {
    renderAccuracy('en');

    expect(
      screen.getByText(
        /mean squared error between the predicted probability of the eventual series winner and 1/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /groups predictions into probability buckets and compares the mean predicted probability/i,
      ),
    ).toBeInTheDocument();
  });

  it('renders the deterministic pinned combined hit rate / Brier for the sweep', () => {
    renderAccuracy('en');

    // Pinned (FEAT-002) accuracy 0.5 combined: hitRate 0.822222, brier 0.165587.
    expect(screen.getByTestId('hitRate-0.5-combined')).toHaveTextContent('82.2%');
    expect(screen.getByTestId('brier-0.5-combined')).toHaveTextContent('0.166');

    // Pinned per-season at 0.5.
    expect(screen.getByTestId('hitRate-0.5-2024')).toHaveTextContent('90.7%');
    expect(screen.getByTestId('hitRate-0.5-2025')).toHaveTextContent('74.5%');

    // accuracy=0 collapses Brier to exactly 0.25 for every slice.
    expect(screen.getByTestId('brier-0-combined')).toHaveTextContent('0.250');
  });

  it('renders five calibration buckets with accessible per-bucket labels', () => {
    renderAccuracy('en');

    const calibration = screen.getByTestId('accuracy-calibration');
    const rows = within(calibration).getAllByTestId(/^calibration-bin-/);
    expect(rows).toHaveLength(5);
    // Each bucket row carries an accessible aria-label describing it.
    expect(rows[0]).toHaveAttribute('aria-label', expect.stringContaining('Bucket'));
  });

  it('localizes the page to Japanese', () => {
    renderAccuracy('ja');

    expect(
      screen.getByRole('region', { name: /モデル精度とバックテスト結果/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('的中率').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ブライアスコア').length).toBeGreaterThan(0);
    expect(screen.getAllByText('キャリブレーション').length).toBeGreaterThan(0);
    expect(
      screen.getByText(/最終的なシリーズ勝者に対して予測した確率と1との平均二乗誤差/),
    ).toBeInTheDocument();
  });
});
