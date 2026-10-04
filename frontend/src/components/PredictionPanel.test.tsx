import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { Prediction } from '@mlb/shared';
import { PredictionPanel } from './PredictionPanel';
import { worldSeries } from '../test/fixtures';
import * as api from '../api';

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return { ...actual, getPrediction: vi.fn() };
});

const mockedGetPrediction = vi.mocked(api.getPrediction);

const prediction: Prediction = {
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
    render(<PredictionPanel series={null} season={2024} />);
    expect(screen.getByText(/Select a series/)).toBeInTheDocument();
    expect(mockedGetPrediction).not.toHaveBeenCalled();
  });

  it('renders favorite, probability and narrative from the mocked prediction', async () => {
    mockedGetPrediction.mockResolvedValue(prediction);
    render(<PredictionPanel series={worldSeries} season={2024} />);

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
    expect(mockedGetPrediction).toHaveBeenCalledWith(
      '2024-ws-worldseries-119-147',
      2024,
    );
  });

  it('shows an error message when the prediction request fails', async () => {
    mockedGetPrediction.mockRejectedValue(new api.ApiError('series not found', 404));
    render(<PredictionPanel series={worldSeries} season={2024} />);

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/series not found/),
    );
  });
});
