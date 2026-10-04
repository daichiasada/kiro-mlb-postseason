import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import type { Bracket } from '@mlb/shared';
import { App } from './App';
import { sampleBracket } from './test/fixtures';
import * as api from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return { ...actual, getBracket: vi.fn(), getPrediction: vi.fn() };
});

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

describe('App season selector', () => {
  beforeEach(() => {
    mockedGetBracket.mockReset();
    mockedGetPrediction.mockReset();
  });

  it('renders a selector for 2024, 2025 and 2026 and defaults to 2026', async () => {
    mockedGetBracket.mockResolvedValue({ bracket: bracket2026, usedFallback: false });
    render(<App />);

    const group = screen.getByRole('group', { name: /season/i });
    expect(within(group).getByRole('button', { name: '2024' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: '2025' })).toBeInTheDocument();
    const btn2026 = within(group).getByRole('button', { name: '2026' });
    expect(btn2026).toHaveAttribute('aria-pressed', 'true');

    await waitFor(() => expect(mockedGetBracket).toHaveBeenCalledWith(2026));
  });

  it('shows the interactive prediction affordance for the predictable 2026 season', async () => {
    mockedGetBracket.mockResolvedValue({ bracket: bracket2026, usedFallback: false });
    render(<App />);

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

    render(<App />);
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

    render(<App />);
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
    render(<App />);

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
});
