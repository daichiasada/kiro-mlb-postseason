import { describe, expect, it } from 'vitest';
import { ogCacheKey, shareCacheKey, type OgCacheKeyInput } from './ogCacheKey.js';

const base: OgCacheKeyInput = {
  seriesId: '2024-al-wildcard-117-116',
  highWins: 1,
  lowWins: 2,
  lang: 'en',
};

describe('ogCacheKey', () => {
  it('is deterministic and stable for identical inputs', () => {
    expect(ogCacheKey(base)).toBe(ogCacheKey({ ...base }));
    expect(ogCacheKey(base)).toBe('OG#2024-al-wildcard-117-116#1-2#en');
  });

  it('changes when the seriesId changes', () => {
    expect(ogCacheKey({ ...base, seriesId: '2024-al-wildcard-116-117' })).not.toBe(
      ogCacheKey(base),
    );
  });

  it('changes when highWins changes (game result update => invalidation)', () => {
    expect(ogCacheKey({ ...base, highWins: base.highWins + 1 })).not.toBe(ogCacheKey(base));
  });

  it('changes when lowWins changes (game result update => invalidation)', () => {
    expect(ogCacheKey({ ...base, lowWins: base.lowWins + 1 })).not.toBe(ogCacheKey(base));
  });

  it('changes when the lang changes', () => {
    expect(ogCacheKey({ ...base, lang: 'ja' })).not.toBe(ogCacheKey(base));
  });
});

describe('shareCacheKey', () => {
  it('is deterministic and uses a SHARE# prefix', () => {
    expect(shareCacheKey(base)).toBe('SHARE#2024-al-wildcard-117-116#1-2#en');
  });

  it('never collides with the OG image key for the same inputs', () => {
    expect(shareCacheKey(base)).not.toBe(ogCacheKey(base));
  });
});
