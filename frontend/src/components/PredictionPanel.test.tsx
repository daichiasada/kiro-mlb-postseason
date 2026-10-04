import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { PredictionResponse } from '@mlb/shared';
import {
  DEFAULT_NARRATIVE_MODEL_ID,
  NARRATIVE_MODEL_OPTIONS,
} from '@mlb/shared';
import { PredictionPanel } from './PredictionPanel';
import { I18nProvider, useI18n } from '../i18n';
import { worldSeries } from '../test/fixtures';
import * as api from '../api';

/** Renders a node inside the i18n provider pinned to English. */
function renderWithI18n(node: ReactElement) {
  return render(<I18nProvider initialLang="en">{node}</I18nProvider>);
}

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return { ...actual, getPrediction: vi.fn() };
});

const mockedGetPrediction = vi.mocked(api.getPrediction);

const prediction: PredictionResponse = {
  mode: 'prediction',
  seriesId: '2024-ws-worldseries-119-147',
  favoriteTeamId: 119,
  favoriteWinProbability: 0.73,
  narrative: 'The Dodgers hold a commanding series lead and are poised to close it out.',
  model: 'anthropic.claude-3-haiku-20240307-v1:0',
  generatedAt: '2024-10-30T00:00:00.000Z',
};

describe('PredictionPanel', () => {
  beforeEach(() => {
    mockedGetPrediction.mockReset();
  });

  it('shows the idle hint when no series is selected', () => {
    renderWithI18n(<PredictionPanel series={null} season={2024} />);
    expect(screen.getByText(/Select a series/)).toBeInTheDocument();
    expect(mockedGetPrediction).not.toHaveBeenCalled();
  });

  it('renders favorite, probability and narrative from the mocked prediction', async () => {
    mockedGetPrediction.mockResolvedValue(prediction);
    renderWithI18n(<PredictionPanel series={worldSeries} season={2024} />);

    await waitFor(() =>
      expect(screen.getByText('Los Angeles Dodgers')).toBeInTheDocument(),
    );
    // 0.73 fraction -> 73.0%
    expect(screen.getByText('73.0%')).toBeInTheDocument();
    expect(
      screen.getByText(/commanding series lead/),
    ).toBeInTheDocument();

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '73');
    // The panel threads the default model accuracy (0.5), the active UI
    // language ('en', pinned by the provider), and the default model id.
    expect(mockedGetPrediction).toHaveBeenCalledWith(
      '2024-ws-worldseries-119-147',
      2024,
      0.5,
      'en',
      DEFAULT_NARRATIVE_MODEL_ID,
    );
  });

  it('re-requests the prediction with the chosen accuracy when the slider changes', async () => {
    mockedGetPrediction.mockResolvedValue(prediction);
    const { container } = renderWithI18n(
      <PredictionPanel series={worldSeries} season={2024} />,
    );

    await waitFor(() =>
      expect(screen.getByText('Los Angeles Dodgers')).toBeInTheDocument(),
    );
    // Initial request used the default accuracy (0.5), language and model.
    expect(mockedGetPrediction).toHaveBeenNthCalledWith(
      1,
      worldSeries.id,
      2024,
      0.5,
      'en',
      DEFAULT_NARRATIVE_MODEL_ID,
    );

    const slider = container.querySelector(
      '.prediction__accuracy-slider',
    ) as HTMLInputElement;
    expect(slider).not.toBeNull();

    // Dragging to a higher accuracy issues a new request carrying it (debounced).
    fireEvent.change(slider, { target: { value: '0.9' } });
    await waitFor(() =>
      expect(mockedGetPrediction).toHaveBeenLastCalledWith(
        worldSeries.id,
        2024,
        0.9,
        'en',
        DEFAULT_NARRATIVE_MODEL_ID,
      ),
    );
  });

  it('sends the UI language and re-requests when the language changes', async () => {
    mockedGetPrediction.mockResolvedValue(prediction);
    // A tiny harness exposing the i18n setLang so the test can toggle the
    // active language live (the provider's language is state, not a prop, so a
    // rerender with a different initialLang would not change it).
    function Harness() {
      const { setLang } = useI18n();
      return (
        <>
          <button type="button" onClick={() => setLang('en')}>
            to-english
          </button>
          <PredictionPanel series={worldSeries} season={2024} />
        </>
      );
    }
    render(
      <I18nProvider initialLang="ja">
        <Harness />
      </I18nProvider>,
    );

    await waitFor(() =>
      expect(mockedGetPrediction).toHaveBeenLastCalledWith(
        worldSeries.id,
        2024,
        0.5,
        'ja',
        DEFAULT_NARRATIVE_MODEL_ID,
      ),
    );

    // Switching the language re-fetches the narrative in English.
    fireEvent.click(screen.getByRole('button', { name: 'to-english' }));

    await waitFor(() =>
      expect(mockedGetPrediction).toHaveBeenLastCalledWith(
        worldSeries.id,
        2024,
        0.5,
        'en',
        DEFAULT_NARRATIVE_MODEL_ID,
      ),
    );
  });

  it('renders the Amazon model options and re-requests with the chosen model', async () => {
    mockedGetPrediction.mockResolvedValue(prediction);
    const { container } = renderWithI18n(
      <PredictionPanel series={worldSeries} season={2024} />,
    );

    await waitFor(() =>
      expect(screen.getByText('Los Angeles Dodgers')).toBeInTheDocument(),
    );

    const select = container.querySelector(
      '.prediction__model-select',
    ) as HTMLSelectElement;
    expect(select).not.toBeNull();
    // Every shared model option is offered, including the Amazon Nova family.
    for (const option of NARRATIVE_MODEL_OPTIONS) {
      expect(
        screen.getByRole('option', { name: option.label }),
      ).toBeInTheDocument();
    }
    expect(screen.getByRole('option', { name: 'Amazon Nova Micro' })).toBeInTheDocument();

    // Choosing a different Amazon model issues a new request carrying its id.
    fireEvent.change(select, { target: { value: 'us.amazon.nova-pro-v1:0' } });
    await waitFor(() =>
      expect(mockedGetPrediction).toHaveBeenLastCalledWith(
        worldSeries.id,
        2024,
        0.5,
        'en',
        'us.amazon.nova-pro-v1:0',
      ),
    );
  });

  it('shows an error message when the prediction request fails', async () => {
    mockedGetPrediction.mockRejectedValue(new api.ApiError('series not found', 404));
    renderWithI18n(<PredictionPanel series={worldSeries} season={2024} />);

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/series not found/),
    );
  });

  it('renders a graceful message for an upcoming (not-yet-started) series', async () => {
    const upcoming: PredictionResponse = {
      mode: 'upcoming',
      seriesId: worldSeries.id,
      season: 2026,
      message: 'No prediction is available yet for this 2026 series; it has not started.',
    };
    mockedGetPrediction.mockResolvedValue(upcoming);
    renderWithI18n(<PredictionPanel series={worldSeries} season={2026} />);

    await waitFor(() =>
      expect(screen.getByText(/has not started/i)).toBeInTheDocument(),
    );
    // No numeric prediction bar is shown for the upcoming state.
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
