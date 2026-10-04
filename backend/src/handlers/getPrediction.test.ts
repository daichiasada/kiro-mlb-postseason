import { describe, expect, it } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler } from './getPrediction.js';
import type { ResultsOnlyPrediction } from '@mlb/shared';

/**
 * Builds a minimal API Gateway (HTTP API) GET event for the prediction handler.
 * Only the fields the handler reads are populated.
 */
function getEvent(query: Record<string, string>): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'GET /prediction',
    rawPath: '/prediction',
    rawQueryString: new URLSearchParams(query).toString(),
    headers: {},
    queryStringParameters: query,
    requestContext: {
      http: { method: 'GET', path: '/prediction', protocol: 'HTTP/1.1', sourceIp: '', userAgent: '' },
    },
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
}

describe('getPrediction handler', () => {
  it('returns a 400 when seriesId is missing', async () => {
    const result = await handler(getEvent({ season: '2024' }), {} as never, () => {});
    expect(result).toBeDefined();
    expect((result as { statusCode: number }).statusCode).toBe(400);
  });

  it('returns a 400 for a malformed season', async () => {
    const result = await handler(
      getEvent({ seriesId: '2024-al-wildcard-117-116', season: 'notayear' }),
      {} as never,
      () => {},
    );
    expect((result as { statusCode: number }).statusCode).toBe(400);
  });

  it('returns HTTP 200 with a results-only body for a past season (no Bedrock call)', async () => {
    // 2024 is results-only: getPrediction short-circuits before any store or
    // Bedrock access, so this needs no mocking and makes no live calls.
    const result = (await handler(
      getEvent({ seriesId: '2024-al-wildcard-117-116', season: '2024' }),
      {} as never,
      () => {},
    )) as { statusCode: number; body: string; headers: Record<string, string> };

    expect(result.statusCode).toBe(200);
    expect(result.headers['Access-Control-Allow-Origin']).toBe('*');

    const body = JSON.parse(result.body) as ResultsOnlyPrediction;
    expect(body.mode).toBe('results');
    expect(body.season).toBe(2024);
    expect(body.seriesId).toBe('2024-al-wildcard-117-116');
    expect(body.message).toContain('2024');
  });
});
