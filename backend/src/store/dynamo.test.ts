import { describe, expect, it, vi } from 'vitest';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { PredictionResponse } from '@mlb/shared';
import { DynamoBracketStore, PREDICTION_TTL_SECONDS } from './dynamo.js';

/**
 * Builds a DynamoBracketStore with an injected DynamoDBDocumentClient-like
 * stub whose `send` is a vi.fn, mirroring the constructor contract
 * `(doc?, tableName?)`. The stub resolves `send` to `sendResult` so a test can
 * stand in for a GetCommand response without any live AWS call.
 */
function makeStore(tableName: string | undefined, sendResult: unknown = {}) {
  const send = vi.fn().mockResolvedValue(sendResult);
  const doc = { send } as unknown as DynamoDBDocumentClient;
  const store = new DynamoBracketStore(doc, tableName);
  return { store, send };
}

const cacheKey = 'PREDICTION#2026-al-wildcard-117-116#1-2#en#us.amazon.nova-lite-v1:0#0.5';

/** A minimal mode:'prediction' response used for the write-path tests. */
const predictionResponse: PredictionResponse = {
  mode: 'prediction',
  seriesId: '2026-al-wildcard-117-116',
  favoriteTeamId: 116,
  favoriteWinProbability: 0.62,
  narrative: 'narrative text',
  model: 'us.amazon.nova-lite-v1:0',
  generatedAt: '2026-10-01T00:00:00.000Z',
};

describe('DynamoBracketStore.getCachedPrediction', () => {
  it('returns undefined and does NOT call send when tableName is unset', async () => {
    const { store, send } = makeStore(undefined);

    const result = await store.getCachedPrediction(cacheKey);

    expect(result).toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  it('returns undefined when the item is missing', async () => {
    const { store, send } = makeStore('table', {});

    const result = await store.getCachedPrediction(cacheKey);

    expect(result).toBeUndefined();
    expect(send).toHaveBeenCalledOnce();
    const command = send.mock.calls[0]![0];
    expect(command).toBeInstanceOf(GetCommand);
    expect(command.input).toMatchObject({ TableName: 'table', Key: { pk: cacheKey } });
  });

  it('returns undefined when the item lacks a prediction attribute', async () => {
    const { store } = makeStore('table', { Item: { pk: cacheKey, ttl: 123 } });

    const result = await store.getCachedPrediction(cacheKey);

    expect(result).toBeUndefined();
  });

  it('returns the stored PredictionResponse when present', async () => {
    const { store } = makeStore('table', {
      Item: { pk: cacheKey, prediction: predictionResponse, ttl: 123 },
    });

    const result = await store.getCachedPrediction(cacheKey);

    expect(result).toEqual(predictionResponse);
  });
});

describe('DynamoBracketStore.putCachedPrediction', () => {
  it('is a no-op (does NOT call send) when tableName is unset', async () => {
    const { store, send } = makeStore(undefined);

    await store.putCachedPrediction(cacheKey, predictionResponse);

    expect(send).not.toHaveBeenCalled();
  });

  it('does NOT write when the response mode is not prediction (results)', async () => {
    const { store, send } = makeStore('table');
    const results: PredictionResponse = {
      mode: 'results',
      seriesId: '2024-al-wildcard-117-116',
      season: 2024,
      message: 'Final results for 2024.',
    };

    await store.putCachedPrediction(cacheKey, results);

    expect(send).not.toHaveBeenCalled();
  });

  it('does NOT write when the response mode is not prediction (upcoming)', async () => {
    const { store, send } = makeStore('table');
    const upcoming: PredictionResponse = {
      mode: 'upcoming',
      seriesId: '2026-al-wildcard-117-116',
      season: 2026,
      message: 'No prediction yet.',
    };

    await store.putCachedPrediction(cacheKey, upcoming);

    expect(send).not.toHaveBeenCalled();
  });

  it('sends a PutCommand carrying pk and a future numeric ttl for a prediction response', async () => {
    const { store, send } = makeStore('table');
    const beforeEpoch = Math.floor(Date.now() / 1000);

    await store.putCachedPrediction(cacheKey, predictionResponse);

    expect(send).toHaveBeenCalledOnce();
    const command = send.mock.calls[0]![0];
    expect(command).toBeInstanceOf(PutCommand);
    expect(command.input.TableName).toBe('table');
    expect(command.input.Item.pk).toBe(cacheKey);
    expect(command.input.Item.prediction).toEqual(predictionResponse);

    const ttl = command.input.Item.ttl as number;
    expect(Number.isFinite(ttl)).toBe(true);
    expect(ttl).toBeGreaterThan(beforeEpoch);
    // The ttl is roughly now + PREDICTION_TTL_SECONDS (allow a small window for
    // the second boundary crossing during the call).
    expect(ttl).toBeGreaterThanOrEqual(beforeEpoch + PREDICTION_TTL_SECONDS - 2);
    expect(ttl).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + PREDICTION_TTL_SECONDS + 2);
  });
});
