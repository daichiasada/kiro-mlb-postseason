/**
 * Thin DynamoDB wrapper for caching the aggregated bracket per season.
 *
 * Items are keyed by `pk = BRACKET#${season}` and carry a numeric `ttl`
 * attribute (epoch seconds) for DynamoDB TTL expiry. When `TABLE_NAME` is not
 * configured (e.g. local runs) the getters resolve to `undefined` and the
 * putters no-op, so callers can degrade gracefully.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Bracket, GameDetailResponse, PredictionResponse } from '@mlb/shared';
import type { WinPctMap } from '../predict/model.js';

/** Default cache lifetime for a cached bracket item. */
const DEFAULT_TTL_SECONDS = 60 * 15; // 15 minutes

/**
 * Cache lifetime for a COMPLETED game's detail. A finished game is immutable,
 * so it is cached for a long time (one week) to avoid refetching.
 */
export const GAME_DETAIL_FINAL_TTL_SECONDS = 60 * 60 * 24 * 7; // 1 week

/**
 * Cache lifetime for an IN-PROGRESS game's detail. A live game changes
 * constantly, so it is cached briefly (one minute) so the UI stays fresh.
 */
export const GAME_DETAIL_LIVE_TTL_SECONDS = 60; // 1 minute

/**
 * Backstop cache lifetime for a cached prediction. The cache key already
 * encodes the series situation (high.wins-low.wins), so a game result update
 * yields a different key and invalidates the cache naturally; this TTL only
 * guards against a situation that lingers unchanged for a long time, matching
 * the live/bracket refresh cadence (15 minutes).
 */
export const PREDICTION_TTL_SECONDS = 60 * 15; // 15 minutes

export interface BracketStore {
  getCachedBracket(season: number): Promise<Bracket | undefined>;
  putCachedBracket(bracket: Bracket, ttlSeconds?: number): Promise<void>;
  getCachedStandings(season: number): Promise<WinPctMap | undefined>;
  putCachedStandings(season: number, winPct: WinPctMap, ttlSeconds?: number): Promise<void>;
  getCachedGameDetail(gamePk: number): Promise<GameDetailResponse | undefined>;
  putCachedGameDetail(detail: GameDetailResponse, ttlSeconds: number): Promise<void>;
  getCachedPrediction(cacheKey: string): Promise<PredictionResponse | undefined>;
  putCachedPrediction(
    cacheKey: string,
    response: PredictionResponse,
    ttlSeconds?: number,
  ): Promise<void>;
}

function partitionKey(season: number): string {
  return `BRACKET#${season}`;
}

function standingsPartitionKey(season: number): string {
  return `STANDINGS#${season}`;
}

function gamePartitionKey(gamePk: number): string {
  return `GAME#${gamePk}`;
}

/**
 * Partition key for a cached prediction. The cache key is already the full
 * `PREDICTION#...` string (see predictionCacheKey), so this is an identity
 * helper kept for symmetry with the other key builders.
 */
function predictionPartitionKey(cacheKey: string): string {
  return cacheKey;
}

/** DynamoDB-backed implementation of {@link BracketStore}. */
export class DynamoBracketStore implements BracketStore {
  private readonly doc: DynamoDBDocumentClient;
  private readonly tableName: string | undefined;

  constructor(doc?: DynamoDBDocumentClient, tableName: string | undefined = process.env.TABLE_NAME) {
    this.doc = doc ?? DynamoDBDocumentClient.from(new DynamoDBClient({}));
    this.tableName = tableName;
  }

  async getCachedBracket(season: number): Promise<Bracket | undefined> {
    if (!this.tableName) return undefined;
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: partitionKey(season) },
      }),
    );
    const item = result.Item;
    if (!item || !item.bracket) return undefined;
    return item.bracket as Bracket;
  }

  async putCachedBracket(bracket: Bracket, ttlSeconds: number = DEFAULT_TTL_SECONDS): Promise<void> {
    if (!this.tableName) return;
    const ttl = Math.floor(Date.now() / 1000) + ttlSeconds;
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          pk: partitionKey(bracket.season),
          season: bracket.season,
          bracket,
          updatedAt: bracket.updatedAt,
          ttl,
        },
      }),
    );
  }

  async getCachedStandings(season: number): Promise<WinPctMap | undefined> {
    if (!this.tableName) return undefined;
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: standingsPartitionKey(season) },
      }),
    );
    const item = result.Item;
    if (!item || !item.winPct) return undefined;
    return item.winPct as WinPctMap;
  }

  async putCachedStandings(
    season: number,
    winPct: WinPctMap,
    ttlSeconds: number = DEFAULT_TTL_SECONDS,
  ): Promise<void> {
    if (!this.tableName) return;
    const ttl = Math.floor(Date.now() / 1000) + ttlSeconds;
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          pk: standingsPartitionKey(season),
          season,
          winPct,
          ttl,
        },
      }),
    );
  }

  async getCachedGameDetail(gamePk: number): Promise<GameDetailResponse | undefined> {
    if (!this.tableName) return undefined;
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: gamePartitionKey(gamePk) },
      }),
    );
    const item = result.Item;
    if (!item || !item.detail) return undefined;
    return item.detail as GameDetailResponse;
  }

  async putCachedGameDetail(
    detail: GameDetailResponse,
    ttlSeconds: number,
  ): Promise<void> {
    if (!this.tableName) return;
    const ttl = Math.floor(Date.now() / 1000) + ttlSeconds;
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          pk: gamePartitionKey(detail.gamePk),
          gamePk: detail.gamePk,
          detail,
          ttl,
        },
      }),
    );
  }

  async getCachedPrediction(cacheKey: string): Promise<PredictionResponse | undefined> {
    if (!this.tableName) return undefined;
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: predictionPartitionKey(cacheKey) },
      }),
    );
    const item = result.Item;
    if (!item || !item.prediction) return undefined;
    return item.prediction as PredictionResponse;
  }

  async putCachedPrediction(
    cacheKey: string,
    response: PredictionResponse,
    ttlSeconds: number = PREDICTION_TTL_SECONDS,
  ): Promise<void> {
    if (!this.tableName) return;
    // Only cache the billable mode:'prediction' responses; the results/upcoming
    // short-circuits never reach the cache and must not be stored.
    if (response.mode !== 'prediction') return;
    const ttl = Math.floor(Date.now() / 1000) + ttlSeconds;
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          pk: predictionPartitionKey(cacheKey),
          prediction: response,
          ttl,
        },
      }),
    );
  }
}
