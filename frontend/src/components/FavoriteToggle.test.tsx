import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FavoriteToggle } from './FavoriteToggle';
import { I18nProvider, type Lang } from '../i18n';
import { FavoritesProvider } from '../FavoritesContext';
import { FAVORITES_STORAGE_KEY } from '../favorites';

/**
 * Renders a FavoriteToggle inside the i18n + favorites providers. The language
 * is pinned so the localized aria-label can be asserted deterministically.
 */
function renderToggle(
  teamId: number,
  { lang = 'en' as Lang, initialFavorites = [] as number[] } = {},
) {
  return render(
    <I18nProvider initialLang={lang}>
      <FavoritesProvider initialFavorites={initialFavorites}>
        <FavoriteToggle teamId={teamId} />
      </FavoritesProvider>
    </I18nProvider>,
  );
}

describe('FavoriteToggle', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders an unpressed button with a localized "add" aria-label (EN)', () => {
    renderToggle(117);
    const button = screen.getByRole('button', {
      name: 'Add Houston Astros to favorites',
    });
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('reflects the favorited state with aria-pressed and a localized "remove" label', () => {
    renderToggle(117, { initialFavorites: [117] });
    const button = screen.getByRole('button', {
      name: 'Remove Houston Astros from favorites',
    });
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('uses Japanese labels when the language is ja', () => {
    renderToggle(117, { lang: 'ja' });
    expect(
      screen.getByRole('button', { name: 'Houston Astrosをお気に入りに追加' }),
    ).toBeInTheDocument();
  });

  it('toggles favorites state on click and persists it', () => {
    renderToggle(119);
    const addButton = screen.getByRole('button', {
      name: 'Add Los Angeles Dodgers to favorites',
    });
    expect(addButton).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(addButton);

    const removeButton = screen.getByRole('button', {
      name: 'Remove Los Angeles Dodgers from favorites',
    });
    expect(removeButton).toHaveAttribute('aria-pressed', 'true');
    // Persisted to localStorage under the shared key.
    expect(JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY)!)).toContain(
      119,
    );

    // Clicking again removes it.
    fireEvent.click(removeButton);
    expect(
      screen.getByRole('button', {
        name: 'Add Los Angeles Dodgers to favorites',
      }),
    ).toHaveAttribute('aria-pressed', 'false');
  });
});
