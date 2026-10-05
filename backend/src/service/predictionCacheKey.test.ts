import { describe, expect, it } from 'vitest';
import { predictionCacheKey, type PredictionCacheKeyInput } from './predictionCacheKey.js';

const base: PredictionCacheKeyInput = {
  seriesId: '2026-al-wildcard-117-116',
  highWins: 1,
  lowWins: 2,
  language: 'en',
  modelId: 'us.amazon.nova-lite-v1:0',
  accuracy: 0.5,
};

describe('predictionCacheKey', () => {
  it('is deterministic and stable for identical inputs', () => {
    expect(predictionCacheKey(base)).toBe(predictionCacheKey({ ...base }));
    expect(predictionCacheKey(base)).toBe(
      'PREDICTION#2026-al-wildcard-117-116#1-2#en#us.amazon.nova-lite-v1:0#0.5',
    );
  });

  it('changes when the seriesId changes', () => {
    expect(predictionCacheKey({ ...base, seriesId: '2026-al-wildcard-116-117' })).not.toBe(
      predictionCacheKey(base),
    );
  });

  it('changes when highWins changes (game result update => invalidation)', () => {
    expect(predictionCacheKey({ ...base, highWins: base.highWins + 1 })).not.toBe(
      predictionCacheKey(base),
    );
  });

  it('changes when lowWins changes (game result update => invalidation)', () => {
    expect(predictionCacheKey({ ...base, lowWins: base.lowWins + 1 })).not.toBe(
      predictionCacheKey(base),
    );
  });

  it('changes when the language changes', () => {
    expect(predictionCacheKey({ ...base, language: 'ja' })).not.toBe(predictionCacheKey(base));
  });

  it('changes when the modelId changes', () => {
    expect(predictionCacheKey({ ...base, modelId: 'us.amazon.nova-pro-v1:0' })).not.toBe(
      predictionCacheKey(base),
    );
  });

  it('changes when the accuracy changes', () => {
    expect(predictionCacheKey({ ...base, accuracy: 0.9 })).not.toBe(predictionCacheKey(base));
  });
});
