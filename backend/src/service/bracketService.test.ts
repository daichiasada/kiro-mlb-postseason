import { describe, expect, it, vi } from 'vitest';
import { getSeedBracket, type Bracket } from '@mlb/shared';
import { BracketService, SeriesNotFoundError } from './bracketService.js';
import type { BracketStore } from '../store/dynamo.js';
import type { BedrockInvoker } from '../bedrock/narrative.js';

const sampleBracket: Bracket = {
  season: 2024,
  updatedAt: '2024-10-01T00:00:00.000Z',
  series: [
    {
      id: '2024-al-wildcard-117-116',
      round: 'Wild Card',
      league: 'AL',
      high: { teamId: 117, wins: 0 },
      low: { teamId: 116, wins: 2 },
      bestOf: 3,
      status: 'final',
      games: [],
    },
  ],
};

function memoryStore(initial?: Bracket): BracketStore {
  let stored = initial;
  return {
    getCachedBracket: vi.fn(async () => stored),
    putCachedBracket: vi.fn(async (b: Bracket) => {
      stored = b;
    }),
  };
}

const invoker: BedrockInvoker = { invoke: vi.fn().mockResolvedValue('narrative text') };

describe('BracketService.getBracket', () => {
  it('returns the cached bracket without fetching (cache hit)', async () => {
    const store = memoryStore(sampleBracket);
    const fetchSchedule = vi.fn();
    const service = new BracketService({ store, fetchSchedule, bedrockInvoker: invoker });

    const bracket = await service.getBracket(2024);

    expect(bracket).toEqual(sampleBracket);
    expect(fetchSchedule).not.toHaveBeenCalled();
  });

  it('falls back to the 2024 seed when the MLB fetch fails', async () => {
    const store = memoryStore(undefined);
    const fetchSchedule = vi.fn().mockRejectedValue(new Error('network down'));
    const service = new BracketService({ store, fetchSchedule, bedrockInvoker: invoker });

    const bracket = await service.getBracket(2024);

    expect(fetchSchedule).toHaveBeenCalledWith(2024);
    expect(bracket).toEqual(getSeedBracket(2024));
  });

  it('rethrows when the fetch fails and no seed is available', async () => {
    const store = memoryStore(undefined);
    const fetchSchedule = vi.fn().mockRejectedValue(new Error('network down'));
    const service = new BracketService({ store, fetchSchedule, bedrockInvoker: invoker });

    await expect(service.getBracket(1999)).rejects.toThrow('network down');
  });

  it('fetches, aggregates, and caches on a cache miss', async () => {
    const store = memoryStore(undefined);
    const fetchSchedule = vi.fn().mockResolvedValue([
      {
        gamePk: 1,
        gameDate: '2024-10-01T18:00:00Z',
        seriesDescription: 'AL Wild Card Series',
        seriesGameNumber: 1,
        gamesInSeries: 3,
        teams: {
          away: { team: { id: 116, name: 'Detroit Tigers' }, score: 3, isWinner: true },
          home: { team: { id: 117, name: 'Houston Astros' }, score: 1, isWinner: false },
        },
      },
    ]);
    const service = new BracketService({ store, fetchSchedule, bedrockInvoker: invoker });

    const bracket = await service.getBracket(2024);

    expect(fetchSchedule).toHaveBeenCalledOnce();
    expect(bracket.series).toHaveLength(1);
    expect(store.putCachedBracket).toHaveBeenCalledOnce();
  });
});

describe('BracketService.getPrediction', () => {
  it('builds a Prediction for an existing series', async () => {
    const store = memoryStore(sampleBracket);
    const service = new BracketService({ store, fetchSchedule: vi.fn(), bedrockInvoker: invoker });

    const prediction = await service.getPrediction('2024-al-wildcard-117-116', 2024);

    expect(prediction.seriesId).toBe('2024-al-wildcard-117-116');
    expect(prediction.favoriteTeamId).toBe(116); // low seed led the series 2-0
    expect(prediction.favoriteWinProbability).toBeGreaterThanOrEqual(0.5);
    expect(prediction.favoriteWinProbability).toBeLessThanOrEqual(0.95);
    expect(prediction.narrative).toBe('narrative text');
    expect(prediction.model).toBeTruthy();
    expect(prediction.generatedAt).toBeTruthy();
  });

  it('throws SeriesNotFoundError for an unknown series', async () => {
    const store = memoryStore(sampleBracket);
    const service = new BracketService({ store, fetchSchedule: vi.fn(), bedrockInvoker: invoker });

    await expect(service.getPrediction('does-not-exist', 2024)).rejects.toBeInstanceOf(
      SeriesNotFoundError,
    );
  });
});
