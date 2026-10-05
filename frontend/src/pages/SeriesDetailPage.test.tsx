import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  render,
  screen,
  waitFor,
  within,
  fireEvent,
} from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { Bracket, GameDetailResponse } from '@mlb/shared';
import { SeriesDetailPage } from './SeriesDetailPage';
import { I18nProvider } from '../i18n';
import { ThemeProvider } from '../ThemeContext';
import { FavoritesProvider } from '../FavoritesContext';
import * as api from '../api';

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return { ...actual, getBracket: vi.fn(), getGameDetail: vi.fn() };
});

const mockedGetBracket = vi.mocked(api.getBracket);
const mockedGetGameDetail = vi.mocked(api.getGameDetail);

/** A FINAL ALCS: Houston (117) beat Seattle (136) 4-2, with two games. */
const SERIES_ID = '2026-al-championship-117-136';

const bracket: Bracket = {
  season: 2026,
  updatedAt: '2026-10-25T00:00:00.000Z',
  series: [
    {
      id: SERIES_ID,
      round: 'Championship Series',
      league: 'AL',
      high: { teamId: 117, wins: 4 },
      low: { teamId: 136, wins: 2 },
      bestOf: 7,
      status: 'final',
      games: [
        {
          gamePk: 800001,
          date: '2026-10-12',
          away: { teamId: 136, score: 3, isWinner: false },
          home: { teamId: 117, score: 5, isWinner: true },
          seriesGameNumber: 1,
        },
        {
          gamePk: 800002,
          date: '2026-10-13',
          away: { teamId: 136, score: 2, isWinner: false },
          home: { teamId: 117, score: 4, isWinner: true },
          seriesGameNumber: 2,
        },
      ],
    },
  ],
};

const okDetail: Extract<GameDetailResponse, { status: 'ok' }> = {
  status: 'ok',
  gamePk: 800001,
  gameState: 'Final',
  venue: 'Daikin Park',
  innings: [
    { inning: 1, ordinal: '1st', away: { runs: 1, hits: 1, errors: 0 }, home: { runs: 0, hits: 1, errors: 0 } },
    { inning: 2, ordinal: '2nd', away: { runs: 0, hits: 0, errors: 0 }, home: { runs: 2, hits: 2, errors: 0 } },
  ],
  totals: {
    away: { runs: 3, hits: 3, errors: 1 },
    home: { runs: 5, hits: 8, errors: 0 },
  },
  pitchers: {
    winner: 'Framber Valdez',
    loser: 'Logan Gilbert',
    save: 'Josh Hader',
  },
  highlight: {
    title: 'Astros take Game 1',
    url: 'https://www.mlb.com/video/astros-game-1',
  },
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/season/2026/series/${SERIES_ID}`]}>
      <ThemeProvider initialPreference="light">
        <I18nProvider initialLang="en">
          <FavoritesProvider initialFavorites={[]}>
            <Routes>
              <Route
                path="/season/:season/series/:seriesId"
                element={<SeriesDetailPage />}
              />
            </Routes>
          </FavoritesProvider>
        </I18nProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe('SeriesDetailPage game-detail accordion', () => {
  beforeEach(() => {
    mockedGetBracket.mockReset();
    mockedGetGameDetail.mockReset();
    mockedGetBracket.mockResolvedValue({ bracket, usedFallback: false });
  });

  it('is collapsed by default with the final score visible and no fetch', async () => {
    renderPage();

    // Final score line (fallback) is always visible for game 1.
    const toggle = await screen.findByRole('button', {
      name: /Game 1/,
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(toggle).getByText(/HOU 5/)).toBeInTheDocument();
    expect(within(toggle).getByText(/SEA 3/)).toBeInTheDocument();

    // Lazy: no fetch until the user expands.
    expect(mockedGetGameDetail).not.toHaveBeenCalled();
  });

  it('expands to fetch once and render the inning table, pitchers, and venue', async () => {
    mockedGetGameDetail.mockResolvedValue(okDetail);
    renderPage();

    const toggle = await screen.findByRole('button', { name: /Game 1/ });
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await waitFor(() =>
      expect(screen.getByText('Daikin Park')).toBeInTheDocument(),
    );
    // Fetched exactly once, for game 1's gamePk.
    expect(mockedGetGameDetail).toHaveBeenCalledTimes(1);
    expect(mockedGetGameDetail).toHaveBeenCalledWith(800001);

    // Pitchers.
    expect(screen.getByText('Framber Valdez')).toBeInTheDocument();
    expect(screen.getByText('Logan Gilbert')).toBeInTheDocument();
    expect(screen.getByText('Josh Hader')).toBeInTheDocument();

    // The inning R/H/E table rendered with a column header per inning.
    const table = screen.getByRole('table');
    expect(within(table).getByText('1st')).toBeInTheDocument();
    expect(within(table).getByText('2nd')).toBeInTheDocument();
    // Row headers for the two teams.
    expect(within(table).getByRole('rowheader', { name: 'HOU' })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: 'SEA' })).toBeInTheDocument();

    // Highlights link opens in a new tab safely.
    const link = screen.getByRole('link', { name: /Astros take Game 1/ });
    expect(link).toHaveAttribute('href', 'https://www.mlb.com/video/astros-game-1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('wraps the inning table in a .detail__linescore-scroll container (criterion 3)', async () => {
    mockedGetGameDetail.mockResolvedValue(okDetail);
    const { container } = renderPage();

    const toggle = await screen.findByRole('button', { name: /Game 1/ });
    fireEvent.click(toggle);

    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
    const scroll = container.querySelector('.detail__linescore-scroll');
    expect(scroll).not.toBeNull();
    expect(scroll?.querySelector('table')).not.toBeNull();
  });

  it('omits the save line when pitchers.save is absent', async () => {
    mockedGetGameDetail.mockResolvedValue({
      ...okDetail,
      pitchers: { winner: 'Framber Valdez', loser: 'Logan Gilbert' },
    });
    renderPage();

    const toggle = await screen.findByRole('button', { name: /Game 1/ });
    fireEvent.click(toggle);

    await waitFor(() =>
      expect(screen.getByText('Framber Valdez')).toBeInTheDocument(),
    );
    expect(screen.queryByText('Save')).not.toBeInTheDocument();
  });

  it('shows the error note but keeps the final score when the fetch rejects (criterion 2)', async () => {
    mockedGetGameDetail.mockRejectedValue(new Error('boom'));
    renderPage();

    const toggle = await screen.findByRole('button', { name: /Game 1/ });
    fireEvent.click(toggle);

    await waitFor(() =>
      expect(
        screen.getByText(/Game detail is unavailable/),
      ).toBeInTheDocument(),
    );
    // The always-visible final score remains.
    expect(within(toggle).getByText(/HOU 5/)).toBeInTheDocument();
    // No inning table on failure.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the fallback note on a status:"unavailable" response and keeps the score', async () => {
    mockedGetGameDetail.mockResolvedValue({
      status: 'unavailable',
      gamePk: 800001,
    });
    renderPage();

    const toggle = await screen.findByRole('button', { name: /Game 1/ });
    fireEvent.click(toggle);

    await waitFor(() =>
      expect(
        screen.getByText(/Game detail is unavailable/),
      ).toBeInTheDocument(),
    );
    expect(within(toggle).getByText(/HOU 5/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
