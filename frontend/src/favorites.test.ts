import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  FAVORITES_STORAGE_KEY,
  addFavorite,
  isFavorite,
  readStoredFavorites,
  removeFavorite,
  storeFavorites,
  toggleFavorite,
} from './favorites';

describe('readStoredFavorites / storeFavorites', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns [] when the key is absent', () => {
    expect(readStoredFavorites()).toEqual([]);
  });

  it('parses a valid array of ids', () => {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([119, 147]));
    expect(readStoredFavorites()).toEqual([119, 147]);
  });

  it('returns [] for a non-JSON string', () => {
    localStorage.setItem(FAVORITES_STORAGE_KEY, 'not json');
    expect(readStoredFavorites()).toEqual([]);
  });

  it('returns [] for JSON that is not an array', () => {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify({ a: 1 }));
    expect(readStoredFavorites()).toEqual([]);
  });

  it('drops strings, NaN, floats, and duplicates, keeping clean integer ids in first-seen order', () => {
    localStorage.setItem(
      FAVORITES_STORAGE_KEY,
      JSON.stringify([119, '147', 119, 1.5, null, 158, 158]),
    );
    expect(readStoredFavorites()).toEqual([119, 158]);
  });

  it('round-trips through storeFavorites', () => {
    storeFavorites([116, 119]);
    expect(localStorage.getItem(FAVORITES_STORAGE_KEY)).toBe('[116,119]');
    expect(readStoredFavorites()).toEqual([116, 119]);
  });

  it('does not throw when localStorage.getItem throws', () => {
    const spy = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });
    expect(() => readStoredFavorites()).not.toThrow();
    expect(readStoredFavorites()).toEqual([]);
    spy.mockRestore();
  });

  it('does not throw when localStorage.setItem throws', () => {
    const spy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota');
      });
    expect(() => storeFavorites([119])).not.toThrow();
    spy.mockRestore();
  });
});

describe('pure array helpers', () => {
  it('isFavorite reports membership', () => {
    expect(isFavorite([119, 147], 119)).toBe(true);
    expect(isFavorite([119, 147], 116)).toBe(false);
  });

  it('addFavorite appends and is idempotent, without mutating the input', () => {
    const base = [119];
    expect(addFavorite(base, 147)).toEqual([119, 147]);
    expect(addFavorite(base, 119)).toEqual([119]);
    expect(base).toEqual([119]);
  });

  it('removeFavorite drops the id without mutating the input', () => {
    const base = [119, 147];
    expect(removeFavorite(base, 119)).toEqual([147]);
    expect(removeFavorite(base, 999)).toEqual([119, 147]);
    expect(base).toEqual([119, 147]);
  });

  it('toggleFavorite adds when absent and removes when present', () => {
    expect(toggleFavorite([119], 147)).toEqual([119, 147]);
    expect(toggleFavorite([119, 147], 119)).toEqual([147]);
  });
});
