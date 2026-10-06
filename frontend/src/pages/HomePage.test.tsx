import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Bracket } from '@mlb/shared';
import { HomePage } from './HomePage';
import { I18nProvider } from '../i18n';
import { ThemeProvider } from '../ThemeContext';
import { FavoritesProvider } from '../FavoritesContext';
import * as api from '../api';

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return { ...actual, getBracket: vi.fn(), getPrediction: vi.fn() };
});

const mockedGetBracket = vi.mocked(api.getBracket);
const mockedGetPrediction = vi.mocked(api.getPrediction);

/** Renders HomePage at the predictable 2026 season in English. */
function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/season/2026']}>
      <ThemeProvider initialPreference="light">
        <I18nProvider initialLang="en">
          <FavoritesProvider initialFavorites={[]}>
            <HomePage />
          </FavoritesProvider>
        </I18nProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

/** A 2026 bracket with an in-progress World Series series (two selectable). */
function makeBracket(updatedAt: string): Bracket {
  return {
    season: 2026,
    updatedAt,
    series: [
      {
        id: '2026-al-wildcard-117-116',
        round: 'Wild Card',
        league: 'AL',
        high: { teamId: 117, wins: 2 },
        low: { teamId: 116, wins: 1 },
        bestOf: 3,
        status: 'final',
        games: [],
      },
      {
        id: '2026-ws-119-147',
        round: 'World Series',
        league: 'WS',
        high: { teamId: 119, wins: 1 },
        low: { teamId: 147, wins: 1 },
        bestOf: 7,
        status: 'in_progress',
        games: [],
      },
    ],
  };
}

describe('HomePage auto-refresh (Issue #17)', () => {
  beforeEach(() => {
    mockedGetBracket.mockReset();
    mockedGetPrediction.mockReset();
    // Selecting a series mounts PredictionPanel, which calls getPrediction;
    // return a benign prediction so that panel settles without noise.
    mockedGetPrediction.mockResolvedValue({
      mode: 'prediction',
      seriesId: '2026-ws-119-147',
      favoriteTeamId: 119,
      favoriteWinProbability: 0.6,
      narrative: 'A tight World Series.',
      model: 'anthropic.claude-3-haiku-20240307-v1:0',
      generatedAt: '2026-10-10T00:00:00.000Z',
    });
  });

  it('shows a localized last-updated line and a manual refresh button', async () => {
    mockedGetBracket.mockResolvedValue({
      bracket: makeBracket(new Date().toISOString()),
      usedFallback: false,
    });
    renderHome();

    await waitFor(() =>
      expect(screen.getByTestId('refresh-bar')).toBeInTheDocument(),
    );
    const bar = screen.getByTestId('refresh-bar');
    expect(within(bar).getByText(/Last updated:/i)).toBeInTheDocument();
    expect(
      within(bar).getByRole('button', { name: /refresh/i }),
    ).toBeInTheDocument();
  });

  it('keeps the bracket mounted (flicker-free) and preserves the selected series across a manual refresh', async () => {
    mockedGetBracket.mockResolvedValue({
      bracket: makeBracket(new Date().toISOString()),
      usedFallback: false,
    });
    renderHome();

    await waitFor(() =>
      expect(
        screen.getByRole('region', { name: /postseason bracket/i }),
      ).toBeInTheDocument(),
    );

    // Select a series to predict (local state that must survive a refresh).
    const predictButtons = screen.getAllByRole('button', {
      name: /predict winner/i,
    });
    fireEvent.click(predictButtons[0]);
    await waitFor(() =>
      expect(screen.getByText(/selected for prediction/i)).toBeInTheDocument(),
    );

    // Trigger a background refresh.
    fireEvent.click(screen.getByRole('button', { name: /^refresh$/i }));

    // The bracket is NEVER unmounted (no full loading screen) during refresh.
    expect(
      screen.getByRole('region', { name: /postseason bracket/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Loading the 2026 postseason/i)).toBeNull();

    await waitFor(() => expect(mockedGetBracket).toHaveBeenCalledTimes(2));

    // Still mounted and the selection persists after the refresh resolves.
    expect(
      screen.getByRole('region', { name: /postseason bracket/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/selected for prediction/i)).toBeInTheDocument();
  });

  it('keeps prior data and shows an unobtrusive inline error on a failed refresh, clearing it on the next success', async () => {
    const good = makeBracket(new Date().toISOString());
    mockedGetBracket
      .mockResolvedValueOnce({ bracket: good, usedFallback: false }) // initial load
      .mockRejectedValueOnce(new Error('network down')) // failed refresh
      .mockResolvedValueOnce({ bracket: good, usedFallback: false }); // recovery

    renderHome();
    await waitFor(() =>
      expect(
        screen.getByRole('region', { name: /postseason bracket/i }),
      ).toBeInTheDocument(),
    );

    // Failed refresh.
    fireEvent.click(screen.getByRole('button', { name: /^refresh$/i }));
    await waitFor(() =>
      expect(
        screen.getByText(/Could not refresh - showing the last loaded data/i),
      ).toBeInTheDocument(),
    );
    // Prior data stays; this is NOT the full-screen error path.
    expect(
      screen.getByRole('region', { name: /postseason bracket/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();

    // Next successful refresh clears the inline error.
    fireEvent.click(screen.getByRole('button', { name: /^refresh$/i }));
    await waitFor(() =>
      expect(
        screen.queryByText(/Could not refresh - showing the last loaded data/i),
      ).toBeNull(),
    );
  });
});
