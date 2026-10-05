import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SeriesCard } from './SeriesCard';
import { I18nProvider } from '../i18n';
import { FavoritesProvider } from '../FavoritesContext';
import { sampleBracket, wildCardSeries } from '../test/fixtures';
import type { Series } from '@mlb/shared';

/**
 * Renders a SeriesCard inside a router + the i18n provider (pinned to English
 * so these assertions read natural English strings). The card uses <Link> for
 * the detail page and useI18n() for its labels.
 */
function renderCard(
  props: Partial<React.ComponentProps<typeof SeriesCard>> = {},
  initialFavorites: number[] = [],
) {
  return render(
    <MemoryRouter>
      <I18nProvider initialLang="en">
        <FavoritesProvider initialFavorites={initialFavorites}>
          <SeriesCard series={wildCardSeries} season={2024} {...props} />
        </FavoritesProvider>
      </I18nProvider>
    </MemoryRouter>,
  );
}

describe('SeriesCard', () => {
  it('renders both team names from the series fixture', () => {
    renderCard();
    expect(screen.getByText('Detroit Tigers')).toBeInTheDocument();
    expect(screen.getByText('Houston Astros')).toBeInTheDocument();
  });

  it('renders the series score and best-of from props', () => {
    renderCard();
    // high (Astros) 0 wins, low (Tigers) 2 wins
    const metas = screen.getByText(/Best of 3/);
    expect(metas.textContent).toContain('0');
    expect(metas.textContent).toContain('2');
    expect(screen.getByText('Final')).toBeInTheDocument();
  });

  it('keeps the game list collapsed by default and reveals it via the toggle', async () => {
    renderCard();

    const toggle = screen.getByRole('button', { name: /show games/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    // Collapsed by default: the list the toggle controls is hidden.
    const listId = toggle.getAttribute('aria-controls')!;
    const list = document.getElementById(listId)!;
    expect(list).toHaveAttribute('hidden');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveTextContent(/hide games/i);
    expect(list).not.toHaveAttribute('hidden');
    expect(within(list).getByText('G1')).toBeInTheDocument();
    expect(within(list).getByText(/DET 3 @ HOU 1/)).toBeInTheDocument();
  });

  it('links a finished series to its detail page', () => {
    renderCard();
    const link = screen.getByRole('link', { name: /view series detail/i });
    expect(link).toHaveAttribute(
      'href',
      '/season/2024/series/2024-al-wildcard-117-116',
    );
  });

  it('renders a localized start time and an Add-to-calendar control for a timed game, and the Time-TBD label with no control for a TBD game', () => {
    const series: Series = {
      ...wildCardSeries,
      id: '2026-al-wildcard-timed',
      status: 'in_progress',
      games: [
        {
          gamePk: 900101,
          date: '2026-10-20',
          startTime: '2026-10-20T23:08:00.000Z',
          away: { teamId: 116, score: null, isWinner: null },
          home: { teamId: 117, score: null, isWinner: null },
          seriesGameNumber: 1,
        },
        {
          gamePk: 900102,
          date: '2026-10-21',
          timeTbd: true,
          away: { teamId: 116, score: null, isWinner: null },
          home: { teamId: 117, score: null, isWinner: null },
          seriesGameNumber: 2,
        },
      ],
    };
    renderCard({ series });

    // Reveal the collapsed games list.
    fireEvent.click(screen.getByRole('button', { name: /show games/i }));
    const list = document.getElementById(
      screen.getByRole('button', { name: /hide games/i }).getAttribute('aria-controls')!,
    )!;
    const [timedRow, tbdRow] = within(list).getAllByRole('listitem');

    // The timed game shows a 12-hour en-US clock and an enabled calendar button.
    expect(timedRow.textContent).toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/i);
    const addButton = within(timedRow).getByRole('button', {
      name: /add .* to your calendar/i,
    });
    expect(addButton).toBeEnabled();
    // Clicking must not throw (download is a no-op in jsdom).
    fireEvent.click(addButton);

    // The TBD game shows the localized Time-TBD label and no calendar control.
    expect(within(tbdRow).getByText('Time TBD')).toBeInTheDocument();
    expect(within(tbdRow).queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows a Predict button (not a detail link) for an in-progress predictable series', () => {
    const inProgress: Series = {
      ...wildCardSeries,
      id: '2026-al-wildcard-117-116',
      status: 'in_progress',
      high: { teamId: 117, wins: 1 },
      low: { teamId: 116, wins: 1 },
    };
    const onSelect = vi.fn();
    render(
      <MemoryRouter>
        <I18nProvider initialLang="en">
          <FavoritesProvider initialFavorites={[]}>
            <SeriesCard
              series={inProgress}
              season={2026}
              onSelect={onSelect}
              predictable
            />
          </FavoritesProvider>
        </I18nProvider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /predict winner/i }));
    expect(onSelect).toHaveBeenCalledWith('2026-al-wildcard-117-116');
    expect(
      screen.queryByRole('link', { name: /view series detail/i }),
    ).not.toBeInTheDocument();
  });

  it('shows the non-color favorite highlight (class + star marker + aria text) when a team in the series is favorited', () => {
    // wildCardSeries is Astros (117) vs Tigers (116). Favorite the Astros.
    renderCard({}, [117]);
    const card = document.querySelector('.series-card')!;
    expect(card).toHaveClass('series-card--favorite');
    // The marker icon is present and announces a localized label to AT.
    const marker = screen.getByTestId('favorite-marker');
    expect(marker).toBeInTheDocument();
    expect(within(marker).getByText("Favorite team's series")).toBeInTheDocument();
  });

  it('does not highlight a series when neither team is favorited', () => {
    renderCard({}, []);
    expect(document.querySelector('.series-card')).not.toHaveClass(
      'series-card--favorite',
    );
    expect(screen.queryByTestId('favorite-marker')).not.toBeInTheDocument();
  });

  it('shows a localized Eliminated badge for a favorited team that lost a final series', () => {
    // In sampleBracket, Astros (117) lost the final Wild Card series to Tigers.
    renderCard({ series: wildCardSeries, bracket: sampleBracket }, [117]);
    expect(screen.getByText('Eliminated')).toBeInTheDocument();
  });

  it('renders a score-diff sparkline (role=img + localized aria-label) for a series with games', () => {
    renderCard();
    // wildCardSeries has 2 games: DET 3 @ HOU 1 (diff 2, DET), DET 5 @ HOU 2 (diff 3, DET).
    const spark = screen.getByRole('img', {
      name: /run differential sparkline, 2 games: DET \+2, DET \+3/i,
    });
    expect(spark.tagName.toLowerCase()).toBe('svg');
    // Decorative only: no focusable element is introduced inside it.
    expect(spark).not.toHaveAttribute('tabindex');
    expect(within(spark as HTMLElement).queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders no sparkline for a games-less series', () => {
    const noGames: Series = { ...wildCardSeries, games: [] };
    renderCard({ series: noGames });
    expect(
      screen.queryByRole('img', { name: /run differential sparkline/i }),
    ).not.toBeInTheDocument();
    expect(document.querySelector('.series-card__sparkline')).toBeNull();
  });

  it('still exposes the card accessible label and keyboard affordances with the sparkline present (no regression)', () => {
    renderCard();
    const card = document.querySelector('.series-card') as HTMLElement;
    // The roving-tabindex card remains focusable and keeps its accessible name.
    expect(card).toHaveAttribute('tabindex', '0');
    expect(card.getAttribute('aria-label')).toMatch(/Houston Astros/);
    expect(card.getAttribute('aria-label')).toMatch(/Detroit Tigers/);
    // The sparkline adds no extra tab stop: the only interactive descendants
    // are the existing favorite toggles plus the games toggle and detail link.
    const buttons = within(card).getAllByRole('button');
    // 2 favorite toggles + 1 games toggle (final series shows a detail link, not a predict button).
    expect(buttons).toHaveLength(3);
  });

  it('exposes a localized star toggle whose aria-pressed reflects favorite state', () => {
    renderCard({}, [117]);
    // Astros (117) is favorited => its toggle offers "Remove ... from favorites".
    const removeBtn = screen.getByRole('button', {
      name: /remove houston astros from favorites/i,
    });
    expect(removeBtn).toHaveAttribute('aria-pressed', 'true');
    // Tigers (116) is not favorited => "Add ... to favorites".
    const addBtn = screen.getByRole('button', {
      name: /add detroit tigers to favorites/i,
    });
    expect(addBtn).toHaveAttribute('aria-pressed', 'false');
    // Toggling adds the Tigers (the label flips to "Remove").
    fireEvent.click(addBtn);
    expect(
      screen.getByRole('button', {
        name: /remove detroit tigers from favorites/i,
      }),
    ).toHaveAttribute('aria-pressed', 'true');
  });
});
