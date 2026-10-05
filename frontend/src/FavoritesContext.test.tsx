import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, renderHook } from '@testing-library/react';
import { FAVORITES_STORAGE_KEY } from './favorites';
import { FavoritesProvider, useFavorites } from './FavoritesContext';

/** A tiny probe that surfaces the context so tests can drive and read it. */
function Probe({ id }: { id: number }) {
  const { favorites, isFavorite, toggle, add, remove } = useFavorites();
  return (
    <div>
      <span data-testid="list">{favorites.join(',')}</span>
      <span data-testid="is-fav">{String(isFavorite(id))}</span>
      <button onClick={() => toggle(id)}>toggle</button>
      <button onClick={() => add(id)}>add</button>
      <button onClick={() => remove(id)}>remove</button>
    </div>
  );
}

describe('FavoritesProvider / useFavorites', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('toggle adds then removes an id, persisting to localStorage', () => {
    render(
      <FavoritesProvider>
        <Probe id={119} />
      </FavoritesProvider>,
    );

    expect(screen.getByTestId('list')).toHaveTextContent('');
    expect(screen.getByTestId('is-fav')).toHaveTextContent('false');

    fireEvent.click(screen.getByText('toggle'));
    expect(screen.getByTestId('list')).toHaveTextContent('119');
    expect(screen.getByTestId('is-fav')).toHaveTextContent('true');
    expect(localStorage.getItem(FAVORITES_STORAGE_KEY)).toBe('[119]');

    fireEvent.click(screen.getByText('toggle'));
    expect(screen.getByTestId('list')).toHaveTextContent('');
    expect(screen.getByTestId('is-fav')).toHaveTextContent('false');
    expect(localStorage.getItem(FAVORITES_STORAGE_KEY)).toBe('[]');
  });

  it('add and remove are idempotent', () => {
    render(
      <FavoritesProvider>
        <Probe id={147} />
      </FavoritesProvider>,
    );

    fireEvent.click(screen.getByText('add'));
    fireEvent.click(screen.getByText('add'));
    expect(screen.getByTestId('list')).toHaveTextContent('147');
    expect(localStorage.getItem(FAVORITES_STORAGE_KEY)).toBe('[147]');

    fireEvent.click(screen.getByText('remove'));
    fireEvent.click(screen.getByText('remove'));
    expect(screen.getByTestId('list')).toHaveTextContent('');
    expect(localStorage.getItem(FAVORITES_STORAGE_KEY)).toBe('[]');
  });

  it('a fresh provider rehydrates persisted favorites from localStorage', () => {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([116, 158]));
    render(
      <FavoritesProvider>
        <Probe id={116} />
      </FavoritesProvider>,
    );
    expect(screen.getByTestId('list')).toHaveTextContent('116,158');
    expect(screen.getByTestId('is-fav')).toHaveTextContent('true');
  });

  it('honors the initialFavorites prop', () => {
    render(
      <FavoritesProvider initialFavorites={[121]}>
        <Probe id={121} />
      </FavoritesProvider>,
    );
    expect(screen.getByTestId('list')).toHaveTextContent('121');
  });

  it('useFavorites throws when used outside a provider', () => {
    expect(() => renderHook(() => useFavorites())).toThrow(
      /useFavorites must be used within a FavoritesProvider/,
    );
  });
});
