import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { Bracket, IntegrityWarning } from '@mlb/shared';
import type { RawGame } from '../mlb/client.js';

/**
 * The handler builds its own BracketService at module load, which uses the MLB
 * client to fetch live games for a predictable season (2026) on a cache miss.
 * We mock the client module so the handler aggregates a crafted bracket with a
 * FINISHED series that references a placeholder/TBD team id (absent from TEAMS),
 * and assert the response carries the integrityWarnings array at HTTP 200.
 */
const PLACEHOLDER_ID = 9001; // not a real MLB team id -> not a key in TEAMS
const REAL_ID = 147; // New York Yankees

function finalSeriesGames(): RawGame[] {
  // Best-of-3 Wild Card: the placeholder team wins games 1 and 2, so the series
  // aggregates to status 'final' while still referencing the placeholder id.
  const makeGame = (gamePk: number, seriesGameNumber: number): RawGame => ({
    gamePk,
    gameDate: '2026-10-05T18:00:00Z',
    seriesDescription: 'AL Wild Card Series',
    seriesGameNumber,
    gamesInSeries: 3,
    status: { abstractGameState: 'Final' },
    teams: {
      away: { team: { id: REAL_ID, name: 'New York Yankees' }, score: 2, isWinner: false },
      home: { team: { id: PLACEHOLDER_ID, name: 'AL Higher Seed' }, score: 5, isWinner: true },
    },
  });
  return [makeGame(900001, 1), makeGame(900002, 2)];
}

vi.mock('../mlb/client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../mlb/client.js')>();
  return {
    ...actual,
    fetchPostseasonSchedule: vi.fn(async () => finalSeriesGames()),
  };
});

// Import AFTER the mock is registered so the handler's service uses it.
const { handler } = await import('./getBracket.js');

function getEvent(query: Record<string, string>): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'GET /bracket',
    rawPath: '/bracket',
    rawQueryString: new URLSearchParams(query).toString(),
    headers: {},
    queryStringParameters: query,
    requestContext: {
      http: { method: 'GET', path: '/bracket', protocol: 'HTTP/1.1', sourceIp: '', userAgent: '' },
    },
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
}

describe('getBracket handler integrity warnings', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // No TABLE_NAME -> cache miss -> live fetch path (mocked).
    delete process.env.TABLE_NAME;
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns HTTP 200 with integrityWarnings for a finished placeholder matchup and logs a warning', async () => {
    const result = (await handler(getEvent({ season: '2026' }), {} as never, () => {})) as {
      statusCode: number;
      body: string;
      headers: Record<string, string>;
    };

    expect(result.statusCode).toBe(200);
    expect(result.headers['Access-Control-Allow-Origin']).toBe('*');

    const body = JSON.parse(result.body) as Bracket & {
      integrityWarnings: IntegrityWarning[];
    };
    expect(Array.isArray(body.integrityWarnings)).toBe(true);
    expect(body.integrityWarnings.length).toBeGreaterThan(0);

    const warning = body.integrityWarnings[0] as IntegrityWarning;
    expect(warning.code).toBe('finished_game_tbd_team');
    expect(warning.teamId).toBe(PLACEHOLDER_ID);

    // Server-side observability: a concise warning is logged when non-empty.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('[integrity]');
  });
});
