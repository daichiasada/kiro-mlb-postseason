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
import type { Bracket } from '@mlb/shared';

/** Default cache lifetime for a cached bracket item. */
const DEFAULT_TTL_SECONDS = 60 * 15; // 15 minutes

export interface BracketStore {
  getCachedBracket(season: number): Promise<Bracket | undefined>;
  putCachedBracket(bracket: Bracket, ttlSeconds?: number): Promise<void>;
}

function partitionKey(season: number): string {
  return `BRACKET#${season}`;
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
}
