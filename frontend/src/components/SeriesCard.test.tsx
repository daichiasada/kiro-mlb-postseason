import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SeriesCard } from './SeriesCard';
import { I18nProvider } from '../i18n';
import { wildCardSeries } from '../test/fixtures';
import type { Series } from '@mlb/shared';

/**
 * Renders a SeriesCard inside a router + the i18n provider (pinned to English
 * so these assertions read natural English strings). The card uses <Link> for
 * the detail page and useI18n() for its labels.
 */
function renderCard(props: Partial<React.ComponentProps<typeof SeriesCard>> = {}) {
  return render(
    <MemoryRouter>
      <I18nProvider initialLang="en">
        <SeriesCard series={wildCardSeries} season={2024} {...props} />
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
          <SeriesCard
            series={inProgress}
            season={2026}
            onSelect={onSelect}
            predictable
          />
        </I18nProvider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /predict winner/i }));
    expect(onSelect).toHaveBeenCalledWith('2026-al-wildcard-117-116');
    expect(
      screen.queryByRole('link', { name: /view series detail/i }),
    ).not.toBeInTheDocument();
  });
});
