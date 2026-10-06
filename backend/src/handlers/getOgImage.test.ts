import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { SHARE_DISCLAIMER, type Series } from '@mlb/shared';

/**
 * The handler builds its own BracketService + DynamoBracketStore at module
 * load. We mock BOTH modules so no live MLB/DynamoDB call happens and we can
 * assert cache-hit vs cache-miss behavior precisely:
 *   - getSeriesWithBracket resolves a captured fixture series (or undefined for
 *     the unknown-series case),
 *   - getCachedOgImage / putCachedOgImage are spies.
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

const { handler } = await import('./getOgImage.js');

function getEvent(query: Record<string, string>): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'GET /og',
    rawPath: '/og',
    rawQueryString: new URLSearchParams(query).toString(),
    headers: {},
    queryStringParameters: query,
    requestContext: {
      http: { method: 'GET', path: '/og', protocol: 'HTTP/1.1', sourceIp: '', userAgent: '' },
    },
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
}

type HandlerResult = { statusCode: number; body: string; headers: Record<string, string> };

async function invoke(query: Record<string, string>): Promise<HandlerResult> {
  return (await handler(getEvent(query), {} as never, () => {})) as HandlerResult;
}

describe('getOgImage handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(getCachedOgImage).not.toHaveBeenCalled();
  });

  it('cache miss: builds the SVG, stores it, returns image/svg+xml with the disclaimer', async () => {
    const result = await invoke({ seriesId: series.id, season: '2024', lang: 'en' });

    expect(result.statusCode).toBe(200);
    expect(result.headers['Content-Type']).toBe('image/svg+xml');
    expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(result.headers['Cache-Control']).toContain('max-age');
    expect(result.body).toContain('<svg');
    expect(result.body).toContain('viewBox="0 0 1200 630"');
    // The disclaimer is emitted by the shared builder into the SVG body.
    expect(result.body).toContain(SHARE_DISCLAIMER.en);
    expect(putCachedOgImage).toHaveBeenCalledTimes(1);
  });

  it('cache hit: returns the stored SVG WITHOUT rebuilding/storing', async () => {
    const stored = '<svg data-cached="1">cached</svg>';
    getCachedOgImage.mockResolvedValue(stored);

    const result = await invoke({ seriesId: series.id, season: '2024' });

    expect(result.statusCode).toBe(200);
    expect(result.headers['Content-Type']).toBe('image/svg+xml');
    expect(result.body).toBe(stored);
    expect(putCachedOgImage).not.toHaveBeenCalled();
  });

  it('emits the localized ja disclaimer when lang=ja', async () => {
    const result = await invoke({ seriesId: series.id, season: '2024', lang: 'ja' });
    expect(result.statusCode).toBe(200);
    expect(result.body).toContain(SHARE_DISCLAIMER.ja);
  });
});
