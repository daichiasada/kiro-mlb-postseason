/**
 * React favorites context (the glue in `./FavoritesContext.tsx`) layered on top
 * of the pure helpers in `./favorites`.
 *
 * The provider hydrates the favorite team ids from localStorage (defaulting to
 * an empty list), exposes immutable add/remove/toggle operations plus an
 * `isFavorite` check through the {@link useFavorites} hook, and persists every
 * change back to localStorage. Multiple favorites are allowed.
 *
 * Everything is guarded so the provider is inert (never throws) under jsdom.
 */
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  addFavorite,
  isFavorite as isFavoriteId,
  readStoredFavorites,
  removeFavorite,
  storeFavorites,
  toggleFavorite,
} from './favorites';

export interface FavoritesContextValue {
  /** The current favorite team ids, in first-added order. */
  favorites: number[];
  /** True iff `id` is currently a favorite. */
  isFavorite: (id: number) => boolean;
  /** Toggle `id`: add if absent, remove if present. Persisted. */
  toggle: (id: number) => void;
  /** Add `id` (idempotent). Persisted. */
  add: (id: number) => void;
  /** Remove `id` (idempotent). Persisted. */
  remove: (id: number) => void;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({
  children,
  initialFavorites,
}: {
  children: ReactNode;
  /** Overrides the hydrated/default favorites (used in tests). */
  initialFavorites?: number[];
}) {
  const [favorites, setFavorites] = useState<number[]>(
    () => initialFavorites ?? readStoredFavorites(),
  );

  // Every mutation computes the next list with the pure helpers, persists it,
  // and returns it as the new state - so storage and state never diverge.
  const add = useCallback((id: number) => {
    setFavorites((current) => {
      const next = addFavorite(current, id);
      storeFavorites(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: number) => {
    setFavorites((current) => {
      const next = removeFavorite(current, id);
      storeFavorites(next);
      return next;
    });
  }, []);

  const toggle = useCallback((id: number) => {
    setFavorites((current) => {
      const next = toggleFavorite(current, id);
      storeFavorites(next);
      return next;
    });
  }, []);

  const isFavorite = useCallback(
    (id: number) => isFavoriteId(favorites, id),
    [favorites],
  );

  const value = useMemo<FavoritesContextValue>(
    () => ({ favorites, isFavorite, toggle, add, remove }),
    [favorites, isFavorite, toggle, add, remove],
  );

  return createElement(FavoritesContext.Provider, { value }, children);
}

/** Access the favorite team ids plus add/remove/toggle/isFavorite. */
export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return ctx;
}
