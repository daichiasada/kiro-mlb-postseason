import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SeriesCard } from './SeriesCard';
import { wildCardSeries } from '../test/fixtures';

describe('SeriesCard', () => {
  it('renders both team names from the series fixture', () => {
    render(<SeriesCard series={wildCardSeries} />);
    expect(screen.getByText('Detroit Tigers')).toBeInTheDocument();
    expect(screen.getByText('Houston Astros')).toBeInTheDocument();
  });

  it('renders the series score and best-of from props', () => {
    render(<SeriesCard series={wildCardSeries} />);
    // high (Astros) 0 wins, low (Tigers) 2 wins
    const metas = screen.getByText(/Best of 3/);
    expect(metas.textContent).toContain('0');
    expect(metas.textContent).toContain('2');
    expect(screen.getByText('Final')).toBeInTheDocument();
  });

  it('renders per-game results', () => {
    render(<SeriesCard series={wildCardSeries} />);
    expect(screen.getByText('G1')).toBeInTheDocument();
    expect(screen.getByText('G2')).toBeInTheDocument();
    expect(screen.getByText(/DET 3 @ HOU 1/)).toBeInTheDocument();
  });

  it('invokes onSelect with the series id when the predict button is clicked', async () => {
    const onSelect = vi.fn();
    const { getByRole } = render(
      <SeriesCard series={wildCardSeries} onSelect={onSelect} />,
    );
    getByRole('button').click();
    expect(onSelect).toHaveBeenCalledWith('2024-al-wildcard-117-116');
  });
});
