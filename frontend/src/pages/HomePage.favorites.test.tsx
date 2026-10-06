import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
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

/**
 * A started 2026 bracket with:
 *  - an in-progress WS: Dodgers (119) lead Yankees (147) 2-1 (active favorite)
 *  - a FINAL ALCS: Astros (117) beat Mariners (136) 4-2 (eliminated favorite:
 *    136 lost a final series)
 */
function makeBracket(): Bracket {
  return {
    season: 2026,
    updatedAt: new Date().toISOString(),
    series: [
      {
        id: '2026-ws-worldseries-119-147',
        round: 'World Series',
        league: 'WS',
        high: { teamId: 119, wins: 2 },
        low: { teamId: 147, wins: 1 },
        bestOf: 7,
        status: 'in_progress',
        games: [],
      },
      {
        id: '2026-al-championship-117-136',
        round: 'Championship Series',
        league: 'AL',
        high: { teamId: 117, wins: 4 },
        low: { teamId: 136, wins: 2 },
        bestOf: 7,
        status: 'final',
        games: [],
      },
    ],
  };
}

function renderHome(initialFavorites: number[]) {
  return render(
    <MemoryRouter initialEntries={['/season/2026']}>
      <ThemeProvider initialPreference="light">
        <I18nProvider initialLang="en">
          <FavoritesProvider initialFavorites={initialFavorites}>
            <HomePage />
          </FavoritesProvider>
        </I18nProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe('HomePage favorites (Issue #18)', () => {
  beforeEach(() => {
    mockedGetBracket.mockReset();
    mockedGetPrediction.mockReset();
    mockedGetBracket.mockResolvedValue({
      bracket: makeBracket(),
      usedFallback: false,
    });
  });

  it('renders no header pin when there are no favorites', async () => {
    renderHome([]);
    await waitFor(() =>
      expect(screen.getByTestId('refresh-bar')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('favorites-pin')).not.toBeInTheDocument();
  });

  it('shows an active status in the header pin for an active favorite', async () => {
    // Dodgers (119) lead the in-progress WS 2-1.
    renderHome([119]);
    const pin = await screen.findByTestId('favorites-pin');
    expect(within(pin).getByText('Los Angeles Dodgers')).toBeInTheDocument();
    expect(within(pin).getByText(/leading 2-1/i)).toBeInTheDocument();
    expect(within(pin).queryByText('Eliminated')).not.toBeInTheDocument();
  });

  it('shows an Eliminated status in the header pin for an eliminated favorite', async () => {
    // Mariners (136) lost the final ALCS to the Astros.
    renderHome([136]);
    const pin = await screen.findByTestId('favorites-pin');
    expect(within(pin).getByText('Seattle Mariners')).toBeInTheDocument();
    expect(within(pin).getByText('Eliminated')).toBeInTheDocument();
  });

  it('does not render a pin entry for a favorite not in this season bracket', async () => {
    // 121 (Mets) is not in the fixture bracket at all.
    renderHome([121]);
    await waitFor(() =>
      expect(screen.getByTestId('refresh-bar')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('favorites-pin')).not.toBeInTheDocument();
  });

  it('filters the bracket to favorite series only when the filter is on', async () => {
    renderHome([119]);
    await waitFor(() =>
      expect(
        screen.getByRole('region', { name: /postseason bracket/i }),
      ).toBeInTheDocument(),
    );
    // Both series render initially.
    expect(
      document.querySelector('[data-series-id="2026-ws-worldseries-119-147"]'),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-series-id="2026-al-championship-117-136"]'),
    ).toBeInTheDocument();

    // Turn the filter on.
    fireEvent.click(screen.getByTestId('favorites-filter'));

    // Only the Dodgers (favorite) series remains.
    expect(
      document.querySelector('[data-series-id="2026-ws-worldseries-119-147"]'),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-series-id="2026-al-championship-117-136"]'),
    ).not.toBeInTheDocument();
  });

  it('shows a localized empty state when the filter is on and no favorite has a series here', async () => {
    // 121 (Mets) has no series in this bracket.
    renderHome([121]);
    await waitFor(() =>
      expect(
        screen.getByRole('region', { name: /postseason bracket/i }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('favorites-filter'));
    expect(
      screen.getByText(
        /None of your favorite teams have a series in this bracket/i,
      ),
    ).toBeInTheDocument();
  });
});
