import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Bracket } from '@mlb/shared';
import { App } from './App';
import { I18nProvider } from './i18n';
import { ThemeProvider } from './ThemeContext';
import { FavoritesProvider } from './FavoritesContext';
import { sampleBracket } from './test/fixtures';
import * as api from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return { ...actual, getBracket: vi.fn(), getPrediction: vi.fn() };
});

/**
 * Renders the full router at `/`, which redirects to `/season/2026` (the
 * default season). The season now lives in the URL, so the App must be driven
 * through a router in tests.
 */
function renderApp() {
  // Pin English so these assertions read natural English strings; the i18n
  // layer's own behavior (default lang, JA strings, persistence) is covered by
  // i18n/index.test.ts.
  return render(
    <MemoryRouter initialEntries={['/']}>
      <ThemeProvider initialPreference="light">
        <I18nProvider initialLang="en">
          <FavoritesProvider initialFavorites={[]}>
            <App />
          </FavoritesProvider>
        </I18nProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

const mockedGetBracket = vi.mocked(api.getBracket);
const mockedGetPrediction = vi.mocked(api.getPrediction);

/** A minimal 2026 bracket with a started (final) series so content renders. */
const bracket2026: Bracket = {
  season: 2026,
  updatedAt: '2026-10-10T00:00:00.000Z',
  series: [
    {
      id: '2026-al-wildcard-117-116',
      round: 'Wild Card',
      league: 'AL',
      high: { teamId: 117, wins: 1 },
      low: { teamId: 116, wins: 0 },
      bestOf: 3,
      status: 'in_progress',
      games: [],
    },
  ],
};

/** A 2026 bracket with only placeholder/scheduled series (not started). */
const bracket2026Upcoming: Bracket = {
  season: 2026,
  updatedAt: '2026-09-01T00:00:00.000Z',
  series: [
    {
      id: '2026-al-wildcard-900-901',
      round: 'Wild Card',
      league: 'AL',
      high: { teamId: 900, wins: 0 },
      low: { teamId: 901, wins: 0 },
      bestOf: 3,
      status: 'scheduled',
      games: [],
    },
  ],
};

/**
 * A 2026 bracket in the REAL live preview-game shape: a placeholder series that
 * HAS games (not an empty array), but every game is a not-yet-played "Preview"
 * with null scores and null winners. The aggregator classifies this as
 * 'scheduled', and the App must treat it as not-started even though
 * `games.length > 0` - this is the shape that previously slipped through the
 * `games.length > 0` check and rendered a live-looking grid.
 */
const bracket2026Preview: Bracket = {
  season: 2026,
  updatedAt: '2026-09-01T00:00:00.000Z',
  series: [
    {
      id: '2026-al-wildcard-9001-9002',
      round: 'Wild Card',
      league: 'AL',
      high: { teamId: 9001, wins: 0 },
      low: { teamId: 9002, wins: 0 },
      bestOf: 3,
      status: 'scheduled',
      games: [
        {
          gamePk: 10,
          date: '2026-10-01',
          away: { teamId: 9002, score: null, isWinner: null },
          home: { teamId: 9001, score: null, isWinner: null },
          seriesGameNumber: 1,
        },
        {
          gamePk: 11,
          date: '2026-10-02',
          away: { teamId: 9001, score: null, isWinner: null },
          home: { teamId: 9002, score: null, isWinner: null },
          seriesGameNumber: 2,
        },
      ],
    },
  ],
};

describe('App season selector', () => {
  beforeEach(() => {
    mockedGetBracket.mockReset();
    mockedGetPrediction.mockReset();
  });

  it('renders a selector for 2024, 2025 and 2026 and defaults to 2026', async () => {
    mockedGetBracket.mockResolvedValue({ bracket: bracket2026, usedFallback: false });
    renderApp();

    const group = screen.getByRole('group', { name: /season/i });
    expect(within(group).getByRole('button', { name: '2024' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: '2025' })).toBeInTheDocument();
    const btn2026 = within(group).getByRole('button', { name: '2026' });
    expect(btn2026).toHaveAttribute('aria-pressed', 'true');

    await waitFor(() => expect(mockedGetBracket).toHaveBeenCalledWith(2026));
  });

  it('shows the interactive prediction affordance for the predictable 2026 season', async () => {
    mockedGetBracket.mockResolvedValue({ bracket: bracket2026, usedFallback: false });
    renderApp();

    await waitFor(() =>
      expect(
        screen.getByRole('region', { name: /win\/loss prediction/i }),
      ).toBeInTheDocument(),
    );
    // The predictable season renders the per-series "Predict winner" affordance.
    expect(
      screen.getByRole('button', { name: /predict winner/i }),
    ).toBeInTheDocument();
  });

  it('hides the prediction panel and Predict affordance for a results-only season', async () => {
    mockedGetBracket
      .mockResolvedValueOnce({ bracket: bracket2026, usedFallback: false })
      .mockResolvedValueOnce({ bracket: sampleBracket, usedFallback: true });

    renderApp();
    await waitFor(() => expect(mockedGetBracket).toHaveBeenCalledWith(2026));

    fireEvent.click(screen.getByRole('button', { name: '2024' }));

    await waitFor(() => expect(mockedGetBracket).toHaveBeenCalledWith(2024));

    // Results-only treatment is shown instead of the interactive panel.
    await waitFor(() =>
      expect(
        screen.getByRole('region', { name: /final results/i }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('region', { name: /win\/loss prediction/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /predict winner/i }),
    ).not.toBeInTheDocument();
    // Bracket/standings still render (the 2024 WS card appears).
    expect(screen.getAllByText('Los Angeles Dodgers').length).toBeGreaterThan(0);
  });

  it('switches the rendered season subtitle when a different year is selected', async () => {
    mockedGetBracket
      .mockResolvedValueOnce({ bracket: bracket2026, usedFallback: false })
      .mockResolvedValueOnce({ bracket: sampleBracket, usedFallback: true });

    renderApp();
    await waitFor(() => expect(mockedGetBracket).toHaveBeenCalledWith(2026));

    fireEvent.click(screen.getByRole('button', { name: '2024' }));
    await waitFor(() =>
      expect(
        screen.getByText((_content, element) => {
          const text = element?.textContent ?? '';
          return (
            element?.classList.contains('app__subtitle') === true &&
            /2024 postseason bracket/i.test(text) &&
            /final results/i.test(text)
          );
        }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('button', { name: '2024' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows an upcoming message for a 2026 bracket with no started series', async () => {
    mockedGetBracket.mockResolvedValue({
      bracket: bracket2026Upcoming,
      usedFallback: false,
    });
    renderApp();

    await waitFor(() =>
      expect(
        screen.getByText(/2026 postseason has not started yet/i),
      ).toBeInTheDocument(),
    );
    // No bracket region / prediction panel for the empty state.
    expect(
      screen.queryByRole('region', { name: /postseason bracket/i }),
    ).not.toBeInTheDocument();
  });

  it('renders a non-blocking integrity banner when the bracket carries integrityWarnings', async () => {
    const flagged: Bracket = {
      ...bracket2026,
      integrityWarnings: [
        {
          code: 'finished_game_tbd_team',
          seriesId: '2026-al-wildcard-117-116',
          round: 'Wild Card',
          league: 'AL',
          teamId: 5513,
          scope: 'series',
        },
      ],
    };
    mockedGetBracket.mockResolvedValue({ bracket: flagged, usedFallback: false });
    renderApp();

    await waitFor(() =>
      expect(
        screen.getByText(/Data integrity: 1 finished matchup/i),
      ).toBeInTheDocument(),
    );
    // The bracket still renders (the banner is non-blocking).
    expect(
      screen.getByRole('region', { name: /postseason bracket/i }),
    ).toBeInTheDocument();
  });

  it('shows no integrity banner for a clean bracket', async () => {
    mockedGetBracket.mockResolvedValue({ bracket: bracket2026, usedFallback: false });
    renderApp();

    await waitFor(() =>
      expect(
        screen.getByRole('region', { name: /postseason bracket/i }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Data integrity:/i)).not.toBeInTheDocument();
  });

  it('shows the upcoming message for the real 2026 preview-game shape (games present, nothing decided)', async () => {
    mockedGetBracket.mockResolvedValue({
      bracket: bracket2026Preview,
      usedFallback: false,
    });
    renderApp();

    await waitFor(() =>
      expect(
        screen.getByText(/2026 postseason has not started yet/i),
      ).toBeInTheDocument(),
    );
    // Even though the series carries preview games, nothing is decided, so the
    // bracket grid and prediction affordance must NOT render.
    expect(
      screen.queryByRole('region', { name: /postseason bracket/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /predict winner/i }),
    ).not.toBeInTheDocument();
  });
});
