import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { SHARE_DISCLAIMER, type Series } from '@mlb/shared';

/**
 * The handler builds its own BracketService + DynamoBracketStore at module
 * load, so both are mocked. getSeriesWithBracket resolves a captured fixture
 * (or undefined for the unknown-series case); the store getters/putters are
 * spies. No live MLB/DynamoDB call happens.
 */
const series: Series = {
  id: '2024-al-wildcard-117-116',
  round: 'Wild Card',
  league: 'AL',
  high: { teamId: 117, wins: 1 },
  low: { teamId: 116, wins: 0 },
  bestOf: 3,
  status: 'in_progress',
  games: [],
};

const getSeriesWithBracket = vi.fn(
  async (): Promise<{ bracket: unknown; series: Series } | undefined> => ({
    bracket: { season: 2024, updatedAt: '', series: [series] },
    series,
  }),
);
const getCachedOgImage = vi.fn(async (): Promise<string | undefined> => undefined);
const putCachedOgImage = vi.fn(async (): Promise<void> => {});

vi.mock('../service/bracketService.js', () => ({
  BracketService: vi.fn(() => ({ getSeriesWithBracket })),
}));

vi.mock('../store/dynamo.js', () => ({
  DynamoBracketStore: vi.fn(() => ({ getCachedOgImage, putCachedOgImage })),
}));

const { handler } = await import('./getShareHtml.js');

function getEvent(
  query: Record<string, string>,
  headers: Record<string, string> = {},
): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'GET /share',
    rawPath: '/share',
    rawQueryString: new URLSearchParams(query).toString(),
    headers,
    queryStringParameters: query,
    requestContext: {
      http: { method: 'GET', path: '/share', protocol: 'HTTP/1.1', sourceIp: '', userAgent: '' },
    },
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
}

type HandlerResult = { statusCode: number; body: string; headers: Record<string, string> };

async function invoke(
  query: Record<string, string>,
  headers?: Record<string, string>,
): Promise<HandlerResult> {
  return (await handler(getEvent(query, headers), {} as never, () => {})) as HandlerResult;
}

describe('getShareHtml handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SITE_ORIGIN;
    getSeriesWithBracket.mockResolvedValue({
      bracket: { season: 2024, updatedAt: '', series: [series] },
      series,
    });
    getCachedOgImage.mockResolvedValue(undefined);
  });

  it('returns 400 for a missing seriesId', async () => {
    const result = await invoke({ season: '2024' });
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('seriesId');
  });

  it('returns 404 for an unknown series', async () => {
    getSeriesWithBracket.mockResolvedValue(undefined);
    const result = await invoke({ seriesId: 'no-such-series', season: '2024' });
    expect(result.statusCode).toBe(404);
  });

  it('returns text/html with og:title/og:image/og:url, the disclaimer, and a SPA redirect', async () => {
    process.env.SITE_ORIGIN = 'https://example.cloudfront.net';
    const result = await invoke({ seriesId: series.id, season: '2024', lang: 'en' });

    expect(result.statusCode).toBe(200);
    expect(result.headers['Content-Type']).toContain('text/html');
    expect(result.headers['Access-Control-Allow-Origin']).toBe('*');

    const body = result.body;
    expect(body).toContain('property="og:title"');
    expect(body).toContain('property="og:image"');
    expect(body).toContain('property="og:url"');
    expect(body).toContain('name="twitter:card"');
    // Disclaimer present in og:description (and body).
    expect(body).toContain(SHARE_DISCLAIMER.en);
    // Redirect into the SPA deep link (meta-refresh + location.replace).
    expect(body).toContain('http-equiv="refresh"');
    expect(body).toContain('location.replace(');
    expect(body).toContain('/season/2024/series/');
    // OG image points at the /og endpoint on the resolved origin.
    expect(body).toContain('https://example.cloudfront.net/og?');

    expect(putCachedOgImage).toHaveBeenCalledTimes(1);
  });

  it('derives the origin from forwarded headers when SITE_ORIGIN is unset', async () => {
    const result = await invoke(
      { seriesId: series.id, season: '2024' },
      { host: 'site.example.com', 'x-forwarded-proto': 'https' },
    );
    expect(result.statusCode).toBe(200);
    expect(result.body).toContain('https://site.example.com/season/2024/series/');
  });

  it('cache hit: returns the stored HTML WITHOUT rebuilding/storing', async () => {
    const stored = '<!DOCTYPE html><html data-cached="1"></html>';
    getCachedOgImage.mockResolvedValue(stored);

    const result = await invoke({ seriesId: series.id, season: '2024' });

    expect(result.statusCode).toBe(200);
    expect(result.headers['Content-Type']).toContain('text/html');
    expect(result.body).toBe(stored);
    expect(putCachedOgImage).not.toHaveBeenCalled();
  });
});
