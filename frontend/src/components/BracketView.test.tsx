import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Bracket } from '@mlb/shared';
import { BracketView } from './BracketView';
import { I18nProvider } from '../i18n';

// Spy on react-router's useNavigate so Enter-on-a-final-card navigation can be
// asserted without a real history change.
const navigateSpy = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateSpy };
});

/**
 * A two-column bracket: a Division Series column with TWO in-progress series
 * (so ArrowDown has somewhere to go) and a World Series column with one FINAL
 * series (so Enter navigates to its detail route).
 */
const bracket: Bracket = {
  season: 2026,
  updatedAt: '2026-10-25T00:00:00.000Z',
  series: [
    {
      id: '2026-al-division-117-116',
      round: 'Division Series',
      league: 'AL',
      high: { teamId: 117, wins: 1 },
      low: { teamId: 116, wins: 0 },
      bestOf: 5,
      status: 'in_progress',
      games: [],
    },
    {
      id: '2026-nl-division-119-147',
      round: 'Division Series',
      league: 'NL',
      high: { teamId: 119, wins: 0 },
      low: { teamId: 147, wins: 1 },
      bestOf: 5,
      status: 'in_progress',
      games: [],
    },
    {
      id: '2026-ws-worldseries-119-117',
      round: 'World Series',
      league: 'WS',
      high: { teamId: 119, wins: 4 },
      low: { teamId: 117, wins: 2 },
      bestOf: 7,
      status: 'final',
      games: [],
    },
  ],
};

function renderBracket(onSelectSeries = vi.fn()) {
  render(
    <MemoryRouter>
      <I18nProvider initialLang="en">
        <BracketView
          bracket={bracket}
          season={2026}
          selectedSeriesId={null}
          onSelectSeries={onSelectSeries}
          predictable
        />
      </I18nProvider>
    </MemoryRouter>,
  );
  return onSelectSeries;
}

/** All series cards in DOM order. */
function cards() {
  return Array.from(
    document.querySelectorAll<HTMLElement>('.series-card'),
  );
}

describe('BracketView keyboard navigation', () => {
  beforeEach(() => {
    navigateSpy.mockReset();
  });

  it('exposes a navigable group with a localized accessible name', () => {
    renderBracket();
    expect(
      screen.getByRole('group', { name: /use the arrow keys to move/i }),
    ).toBeInTheDocument();
  });

  it('uses a roving tabindex: exactly one card is tabbable at a time', () => {
    renderBracket();
    const all = cards();
    expect(all.length).toBe(3);
    const tabbable = all.filter((c) => c.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
    // The rest are removed from the tab order.
    expect(
      all.filter((c) => c.getAttribute('tabindex') === '-1'),
    ).toHaveLength(2);
  });

  it('ArrowDown moves focus to the next series within a column (roving tabindex follows)', () => {
    renderBracket();
    const [first, second] = cards();

    first.focus();
    expect(first).toHaveFocus();

    act(() => {
      fireEvent.keyDown(first, { key: 'ArrowDown' });
    });

    // The next card in the same column becomes the single tabbable card and
    // receives focus.
    expect(second).toHaveFocus();
    expect(second.getAttribute('tabindex')).toBe('0');
    expect(first.getAttribute('tabindex')).toBe('-1');
  });

  it('ArrowRight moves focus to the adjacent round column (clamped by row)', () => {
    renderBracket();
    const all = cards();
    const first = all[0];
    const finalCard = all[2]; // the lone WS card in column 2

    first.focus();
    act(() => {
      fireEvent.keyDown(first, { key: 'ArrowRight' });
    });

    expect(finalCard).toHaveFocus();
    expect(finalCard.getAttribute('tabindex')).toBe('0');
  });

  it('Enter on a FINAL series navigates to its detail route', () => {
    renderBracket();
    const finalCard = cards()[2];
    finalCard.focus();

    fireEvent.keyDown(finalCard, { key: 'Enter' });

    expect(navigateSpy).toHaveBeenCalledWith(
      '/season/2026/series/2026-ws-worldseries-119-117',
    );
  });

  it('Enter on a predictable non-final series selects it for prediction', () => {
    const onSelect = renderBracket();
    const predictableCard = cards()[0];
    predictableCard.focus();

    fireEvent.keyDown(predictableCard, { key: 'Enter' });

    expect(onSelect).toHaveBeenCalledWith('2026-al-division-117-116');
    // A non-final card never triggers navigation.
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('does not activate when the key event originates on an inner control', () => {
    const onSelect = renderBracket();
    const predictableCard = cards()[0];
    const predictButton = predictableCard.querySelector<HTMLButtonElement>(
      '.series-card__predict',
    )!;
    // Simulate Enter fired from the inner button: the card handler must bail so
    // it does not double-fire alongside the button's own click.
    fireEvent.keyDown(predictButton, { key: 'Enter' });
    expect(onSelect).not.toHaveBeenCalled();
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
