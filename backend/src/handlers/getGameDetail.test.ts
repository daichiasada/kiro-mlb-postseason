import { describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { GameDetailResponse } from '@mlb/shared';

/**
 * The handler builds its own BracketService at module load, whose fetchers hit
 * the MLB client on a cache miss. We mock the client module so the handler's
 * service never makes a live call: linescore + feed/live resolve to small
 * captured fixtures. No TABLE_NAME is set, so the store is a no-op cache miss.
 */
const linescoreRaw = {
  innings: [
    { num: 1, ordinalNum: '1st', away: { runs: 1, hits: 2, errors: 0 }, home: { runs: 0, hits: 1, errors: 0 } },
  ],
  teams: {
    away: { runs: 1, hits: 2, errors: 0 },
    home: { runs: 0, hits: 1, errors: 0 },
  },
};

const feedLiveRaw = {
  gameData: { venue: { name: 'Yankee Stadium' }, status: { abstractGameState: 'Final' } },
  liveData: { decisions: { winner: { fullName: 'Gerrit Cole' } } },
};

vi.mock('../mlb/client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../mlb/client.js')>();
  return {
    ...actual,
    fetchGameLinescore: vi.fn(async () => linescoreRaw),
    fetchGameFeedLive: vi.fn(async () => feedLiveRaw),
    fetchGameContent: vi.fn(async () => ({})),
  };
});

const { handler } = await import('./getGameDetail.js');

function getEvent(query: Record<string, string>): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'GET /game',
    rawPath: '/game',
    rawQueryString: new URLSearchParams(query).toString(),
    headers: {},
    queryStringParameters: query,
    requestContext: {
      http: { method: 'GET', path: '/game', protocol: 'HTTP/1.1', sourceIp: '', userAgent: '' },
    },
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
}

type HandlerResult = { statusCode: number; body: string; headers: Record<string, string> };

describe('getGameDetail handler', () => {
  it('returns 400 for a missing gamePk', async () => {
    delete process.env.TABLE_NAME;
    const result = (await handler(getEvent({}), {} as never, () => {})) as HandlerResult;
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain('gamePk');
  });

  it('returns 400 for an invalid (non-positive-integer) gamePk', async () => {
    delete process.env.TABLE_NAME;
    for (const bad of ['abc', '0', '-5', '1.5']) {
      const result = (await handler(getEvent({ gamePk: bad }), {} as never, () => {})) as HandlerResult;
      expect(result.statusCode).toBe(400);
    }
  });

  it('returns 200 with the ok game detail for a valid gamePk', async () => {
    delete process.env.TABLE_NAME;
    const result = (await handler(getEvent({ gamePk: '900001' }), {} as never, () => {})) as HandlerResult;

    expect(result.statusCode).toBe(200);
    expect(result.headers['Access-Control-Allow-Origin']).toBe('*');

    const body = JSON.parse(result.body) as GameDetailResponse;
    expect(body.status).toBe('ok');
    if (body.status === 'ok') {
      expect(body.gamePk).toBe(900001);
      expect(body.gameState).toBe('Final');
      expect(body.venue).toBe('Yankee Stadium');
      expect(body.innings).toHaveLength(1);
      expect(body.pitchers).toEqual({ winner: 'Gerrit Cole' });
    }
  });
});
