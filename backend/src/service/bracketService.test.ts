import { describe, expect, it, vi } from 'vitest';
import { getSeedBracket, type Bracket, type GameDetailResponse } from '@mlb/shared';
import { BracketService } from './bracketService.js';
import {
  GAME_DETAIL_FINAL_TTL_SECONDS,
  GAME_DETAIL_LIVE_TTL_SECONDS,
  type BracketStore,
} from '../store/dynamo.js';
import type { BedrockInvoker } from '../bedrock/narrative.js';
import type { WinPctMap } from '../predict/model.js';

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

function memoryStore(
  initial?: Bracket,
  initialStandings?: WinPctMap,
  initialGameDetail?: GameDetailResponse,
): BracketStore {
  let stored = initial;
  let storedStandings = initialStandings;
  let storedGameDetail = initialGameDetail;
  return {
    getCachedBracket: vi.fn(async () => stored),
    putCachedBracket: vi.fn(async (b: Bracket) => {
      stored = b;
    }),
    getCachedStandings: vi.fn(async () => storedStandings),
    putCachedStandings: vi.fn(async (_season: number, winPct: WinPctMap) => {
      storedStandings = winPct;
    }),
    getCachedGameDetail: vi.fn(async () => storedGameDetail),
    putCachedGameDetail: vi.fn(async (detail: GameDetailResponse) => {
      storedGameDetail = detail;
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

/** An in-progress 2026 bracket with one resolvable, started series. */
const current2026Bracket: Bracket = {
  season: 2026,
  updatedAt: '2026-10-01T00:00:00.000Z',
  series: [
    {
      id: '2026-al-wildcard-117-116',
      round: 'Wild Card',
      league: 'AL',
      high: { teamId: 117, wins: 0 },
      low: { teamId: 116, wins: 2 },
      bestOf: 3,
      status: 'in_progress',
      games: [],
    },
  ],
};

describe('BracketService.getPrediction (results-only seasons)', () => {
  it('returns a results-only response for 2024 without calling predict or Bedrock', async () => {
    const store = memoryStore(sampleBracket);
    const fetchSchedule = vi.fn();
    const bedrockInvoke = vi.fn().mockResolvedValue('narrative text');
    const service = new BracketService({
      store,
      fetchSchedule,
      bedrockInvoker: { invoke: bedrockInvoke },
    });

    const response = await service.getPrediction('2024-al-wildcard-117-116', 2024);

    expect(response.mode).toBe('results');
    expect(response.seriesId).toBe('2024-al-wildcard-117-116');
    if (response.mode === 'results') {
      expect(response.season).toBe(2024);
      expect(response.message).toContain('2024');
    }
    // The results-only path must short-circuit entirely: no Bedrock invoke and
    // no bracket load (the store is never consulted).
    expect(bedrockInvoke).not.toHaveBeenCalled();
    expect(store.getCachedBracket).not.toHaveBeenCalled();
    expect(fetchSchedule).not.toHaveBeenCalled();
  });

  it('returns a results-only response for 2025 without calling Bedrock', async () => {
    const store = memoryStore(undefined);
    const bedrockInvoke = vi.fn().mockResolvedValue('narrative text');
    const service = new BracketService({
      store,
      fetchSchedule: vi.fn(),
      bedrockInvoker: { invoke: bedrockInvoke },
    });

    const response = await service.getPrediction('2025-ws-worldseries-119-141', 2025);

    expect(response.mode).toBe('results');
    expect(bedrockInvoke).not.toHaveBeenCalled();
  });
});

describe('BracketService.getPrediction (current predictable season)', () => {
  it('builds a numeric Prediction for an in-progress series', async () => {
    const store = memoryStore(current2026Bracket);
    const bedrockInvoke = vi.fn().mockResolvedValue('narrative text');
    const service = new BracketService({
      store,
      fetchSchedule: vi.fn(),
      bedrockInvoker: { invoke: bedrockInvoke },
    });

    const response = await service.getPrediction('2026-al-wildcard-117-116', 2026);

    expect(response.mode).toBe('prediction');
    if (response.mode === 'prediction') {
      expect(response.seriesId).toBe('2026-al-wildcard-117-116');
      expect(response.favoriteTeamId).toBe(116); // low seed led the series 2-0
      expect(response.favoriteWinProbability).toBeGreaterThanOrEqual(0.5);
      expect(response.favoriteWinProbability).toBeLessThanOrEqual(0.95);
      expect(response.narrative).toBe('narrative text');
      expect(response.model).toBeTruthy();
      expect(response.generatedAt).toBeTruthy();
    }
    expect(bedrockInvoke).toHaveBeenCalledOnce();
  });

  it('resolves a series whose high/low ids are swapped vs the stored bracket (ISSUE-1)', async () => {
    // The stored series id is 2026-al-wildcard-117-116 (high 117, low 116). A
    // client may have derived the ids in the other order; the swapped request
    // must still resolve the same series via round + unordered team-pair match.
    const store = memoryStore(current2026Bracket);
    const service = new BracketService({ store, fetchSchedule: vi.fn(), bedrockInvoker: invoker });

    const response = await service.getPrediction('2026-al-wildcard-116-117', 2026);

    expect(response.mode).toBe('prediction');
    if (response.mode === 'prediction') {
      expect(response.seriesId).toBe('2026-al-wildcard-116-117');
      expect(response.favoriteTeamId).toBe(116);
      expect(response.favoriteWinProbability).toBeGreaterThanOrEqual(0.5);
      expect(response.favoriteWinProbability).toBeLessThanOrEqual(0.95);
      expect(response.narrative).toBe('narrative text');
    }
  });

  it('returns an upcoming response (not a 500) for an unresolvable series in an empty bracket', async () => {
    const emptyBracket: Bracket = {
      season: 2026,
      updatedAt: '2026-10-01T00:00:00.000Z',
      series: [],
    };
    const store = memoryStore(emptyBracket);
    const bedrockInvoke = vi.fn();
    const service = new BracketService({
      store,
      fetchSchedule: vi.fn(),
      bedrockInvoker: { invoke: bedrockInvoke },
    });

    const response = await service.getPrediction('2026-al-wildcard-999-998', 2026);

    expect(response.mode).toBe('upcoming');
    if (response.mode === 'upcoming') {
      expect(response.season).toBe(2026);
      expect(response.message).toBeTruthy();
    }
    expect(bedrockInvoke).not.toHaveBeenCalled();
  });

  it('returns an upcoming response for a resolvable but not-yet-started (scheduled) series', async () => {
    const scheduledBracket: Bracket = {
      season: 2026,
      updatedAt: '2026-10-01T00:00:00.000Z',
      series: [
        {
          id: '2026-al-wildcard-117-116',
          round: 'Wild Card',
          league: 'AL',
          high: { teamId: 117, wins: 0 },
          low: { teamId: 116, wins: 0 },
          bestOf: 3,
          status: 'scheduled',
          games: [],
        },
      ],
    };
    const store = memoryStore(scheduledBracket);
    const bedrockInvoke = vi.fn();
    const service = new BracketService({
      store,
      fetchSchedule: vi.fn(),
      bedrockInvoker: { invoke: bedrockInvoke },
    });

    const response = await service.getPrediction('2026-al-wildcard-117-116', 2026);

    expect(response.mode).toBe('upcoming');
    expect(bedrockInvoke).not.toHaveBeenCalled();
  });
});

/**
 * A real 2026-shaped schedule: every game is a "Preview" entry with null
 * scores and null winners (nothing has been played yet). This is the shape the
 * live MLB Stats API returns before the postseason starts. These games must
 * aggregate to not-yet-started ('scheduled') series so the upcoming/empty path
 * is reached, NOT a live 0-0 'in_progress' card.
 */
const previewOnly2026Games = [
  {
    gamePk: 10,
    gameDate: '2026-10-01T18:00:00Z',
    seriesDescription: 'AL Wild Card Series',
    seriesGameNumber: 1,
    gamesInSeries: 3,
    status: { abstractGameState: 'Preview' },
    teams: {
      away: { team: { id: 9001, name: 'AL Higher Seed' }, score: null, isWinner: null },
      home: { team: { id: 9002, name: 'AL Lower Seed' }, score: null, isWinner: null },
    },
  },
  {
    gamePk: 11,
    gameDate: '2026-10-02T18:00:00Z',
    seriesDescription: 'AL Wild Card Series',
    seriesGameNumber: 2,
    gamesInSeries: 3,
    status: { abstractGameState: 'Preview' },
    teams: {
      away: { team: { id: 9002, name: 'AL Lower Seed' }, score: null, isWinner: null },
      home: { team: { id: 9001, name: 'AL Higher Seed' }, score: null, isWinner: null },
    },
  },
  {
    gamePk: 12,
    gameDate: '2026-10-20T18:00:00Z',
    seriesDescription: 'World Series',
    seriesGameNumber: 1,
    gamesInSeries: 7,
    status: { abstractGameState: 'Preview' },
    teams: {
      away: {
        team: { id: 9003, name: 'Higher Seed League Champion' },
        score: null,
        isWinner: null,
      },
      home: {
        team: { id: 9004, name: 'Lower Seed League Champion' },
        score: null,
        isWinner: null,
      },
    },
  },
];

/** A FINAL 2026 series: complete even though 2026 is the predictable season. */
const final2026Bracket: Bracket = {
  season: 2026,
  updatedAt: '2026-10-01T00:00:00.000Z',
  series: [
    {
      id: '2026-al-wildcard-117-116',
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

describe('BracketService.getPrediction (series-level final gating)', () => {
  it('returns a results/no-prediction response for a FINAL series in the current predictable season', async () => {
    const store = memoryStore(final2026Bracket);
    const bedrockInvoke = vi.fn().mockResolvedValue('narrative text');
    const service = new BracketService({
      store,
      fetchSchedule: vi.fn(),
      bedrockInvoker: { invoke: bedrockInvoke },
    });

    const response = await service.getPrediction('2026-al-wildcard-117-116', 2026);

    // A finished series yields results, NOT a prediction, even in 2026.
    expect(response.mode).toBe('results');
    expect(response.mode).not.toBe('prediction');
    if (response.mode === 'results') {
      expect(response.season).toBe(2026);
      expect(response.seriesId).toBe('2026-al-wildcard-117-116');
      expect(response.message).toBeTruthy();
    }
    // The predict/Bedrock path must never run for a final series.
    expect(bedrockInvoke).not.toHaveBeenCalled();
  });

  it('still returns mode:prediction for a started, non-final current-season series', async () => {
    const store = memoryStore(current2026Bracket);
    const bedrockInvoke = vi.fn().mockResolvedValue('narrative text');
    const service = new BracketService({
      store,
      fetchSchedule: vi.fn(),
      bedrockInvoker: { invoke: bedrockInvoke },
    });

    const response = await service.getPrediction('2026-al-wildcard-117-116', 2026);

    expect(response.mode).toBe('prediction');
    expect(bedrockInvoke).toHaveBeenCalledOnce();
  });
});

describe('BracketService.getPrediction (configurable accuracy)', () => {
  it('accepts an accuracy argument and influences the returned probability', async () => {
    // Use a strongly favored in-progress series so the accuracy transform has
    // headroom to move the probability.
    const favored2026Bracket: Bracket = {
      season: 2026,
      updatedAt: '2026-10-01T00:00:00.000Z',
      series: [
        {
          id: '2026-al-wildcard-117-116',
          round: 'Wild Card',
          league: 'AL',
          high: { teamId: 117, wins: 2 },
          low: { teamId: 116, wins: 0 },
          bestOf: 5,
          status: 'in_progress',
          games: [],
        },
      ],
    };

    const makeService = () =>
      new BracketService({
        store: memoryStore(favored2026Bracket),
        fetchSchedule: vi.fn(),
        bedrockInvoker: { invoke: vi.fn().mockResolvedValue('narrative text') },
      });

    const low = await makeService().getPrediction('2026-al-wildcard-117-116', 2026, 0.1);
    const high = await makeService().getPrediction('2026-al-wildcard-117-116', 2026, 0.95);

    expect(low.mode).toBe('prediction');
    expect(high.mode).toBe('prediction');
    if (low.mode === 'prediction' && high.mode === 'prediction') {
      // Two different accuracy values yield different probabilities, both valid.
      expect(high.favoriteWinProbability).not.toBe(low.favoriteWinProbability);
      expect(high.favoriteWinProbability).toBeGreaterThan(low.favoriteWinProbability);
      for (const p of [low.favoriteWinProbability, high.favoriteWinProbability]) {
        expect(p).toBeGreaterThanOrEqual(0.5);
        expect(p).toBeLessThanOrEqual(0.95);
      }
    }
  });
});

describe('BracketService.getPrediction (language + model threading)', () => {
  it('threads ja + the resolved model into generateNarrative', async () => {
    const store = memoryStore(current2026Bracket);
    const bedrockInvoke = vi.fn().mockResolvedValue('物語');
    const service = new BracketService({
      store,
      fetchSchedule: vi.fn(),
      bedrockInvoker: { invoke: bedrockInvoke },
    });

    const response = await service.getPrediction(
      '2026-al-wildcard-117-116',
      2026,
      undefined,
      'ja',
      'us.amazon.nova-pro-v1:0',
    );

    expect(response.mode).toBe('prediction');
    if (response.mode === 'prediction') {
      // The resolved (allowlisted) model id is reported back.
      expect(response.model).toBe('us.amazon.nova-pro-v1:0');
      expect(response.narrative).toBe('物語');
    }
    expect(bedrockInvoke).toHaveBeenCalledOnce();
    const [modelId, prompt] = bedrockInvoke.mock.calls[0]!;
    expect(modelId).toBe('us.amazon.nova-pro-v1:0');
    // The ja prompt reached the invoker (localized instruction prose).
    expect(prompt).toContain('野球アナリスト');
  });

  it('falls back to the default model for an unknown model id (no error)', async () => {
    const store = memoryStore(current2026Bracket);
    const bedrockInvoke = vi.fn().mockResolvedValue('narrative text');
    const service = new BracketService({
      store,
      fetchSchedule: vi.fn(),
      bedrockInvoker: { invoke: bedrockInvoke },
    });

    const response = await service.getPrediction(
      '2026-al-wildcard-117-116',
      2026,
      undefined,
      undefined,
      'totally-unknown-model',
    );

    expect(response.mode).toBe('prediction');
    if (response.mode === 'prediction') {
      expect(response.model).toBe('us.amazon.nova-lite-v1:0');
    }
    const [modelId, prompt] = bedrockInvoke.mock.calls[0]!;
    expect(modelId).toBe('us.amazon.nova-lite-v1:0');
    // Missing language defaults to English prose.
    expect(prompt).toContain('concise baseball analyst');
  });
});

describe('BracketService preview-only 2026 schedule (real upcoming shape)', () => {
  it('aggregates Preview games into not-yet-started (scheduled) series', async () => {
    const store = memoryStore(undefined);
    const fetchSchedule = vi.fn().mockResolvedValue(previewOnly2026Games);
    const service = new BracketService({ store, fetchSchedule, bedrockInvoker: invoker });

    const bracket = await service.getBracket(2026);

    expect(bracket.series.length).toBeGreaterThan(0);
    // A series whose only games are Previews has decided nothing: it must be
    // 'scheduled', never a live 0-0 'in_progress' card.
    for (const s of bracket.series) {
      expect(s.status).toBe('scheduled');
      expect(s.high.wins).toBe(0);
      expect(s.low.wins).toBe(0);
    }
  });

  it('returns mode:upcoming for a preview-only series (not a prediction)', async () => {
    const store = memoryStore(undefined);
    const fetchSchedule = vi.fn().mockResolvedValue(previewOnly2026Games);
    const bedrockInvoke = vi.fn();
    const service = new BracketService({
      store,
      fetchSchedule,
      bedrockInvoker: { invoke: bedrockInvoke },
    });

    // Request the preview-only Wild Card series by its aggregated id.
    const response = await service.getPrediction('2026-al-wildcard-9001-9002', 2026);

    expect(response.mode).toBe('upcoming');
    if (response.mode === 'upcoming') {
      expect(response.season).toBe(2026);
      expect(response.message).toBeTruthy();
    }
    // No prediction is produced on placeholder team ids.
    expect(bedrockInvoke).not.toHaveBeenCalled();
  });

  it('still predicts a genuinely in-progress series that has a decided game', async () => {
    // One Final game decided (116 beat 117) → in_progress, predictable.
    const store = memoryStore(undefined);
    const fetchSchedule = vi.fn().mockResolvedValue([
      {
        gamePk: 20,
        gameDate: '2026-10-01T18:00:00Z',
        seriesDescription: 'AL Wild Card Series',
        seriesGameNumber: 1,
        gamesInSeries: 3,
        status: { abstractGameState: 'Final' },
        teams: {
          away: { team: { id: 116, name: 'Detroit Tigers' }, score: 3, isWinner: true },
          home: { team: { id: 117, name: 'Houston Astros' }, score: 1, isWinner: false },
        },
      },
    ]);
    const bedrockInvoke = vi.fn().mockResolvedValue('narrative text');
    const service = new BracketService({
      store,
      fetchSchedule,
      bedrockInvoker: { invoke: bedrockInvoke },
    });

    const response = await service.getPrediction('2026-al-wildcard-117-116', 2026);

    expect(response.mode).toBe('prediction');
    expect(bedrockInvoke).toHaveBeenCalledOnce();
  });
});

describe('BracketService 2026 placeholder/mixed-game aggregation', () => {
  it('aggregates a 2026-like payload with placeholder/unknown teams and mixed game states without throwing', async () => {
    const store = memoryStore(undefined);
    // A mix of a real Final Wild Card game (known team ids) and scheduled
    // 'Preview' games whose teams are placeholders not present in TEAMS.
    const fetchSchedule = vi.fn().mockResolvedValue([
      {
        gamePk: 1,
        gameDate: '2026-10-01T18:00:00Z',
        seriesDescription: 'AL Wild Card Series',
        seriesGameNumber: 1,
        gamesInSeries: 3,
        status: { abstractGameState: 'Final' },
        teams: {
          away: { team: { id: 116, name: 'Detroit Tigers' }, score: 3, isWinner: true },
          home: { team: { id: 117, name: 'Houston Astros' }, score: 1, isWinner: false },
        },
      },
      {
        gamePk: 2,
        gameDate: '2026-10-10T18:00:00Z',
        seriesDescription: 'AL Championship Series',
        seriesGameNumber: 1,
        gamesInSeries: 7,
        status: { abstractGameState: 'Preview' },
        teams: {
          away: { team: { id: 9001, name: 'AL Higher Seed' }, score: null, isWinner: null },
          home: { team: { id: 9002, name: 'AL Lower Seed' }, score: null, isWinner: null },
        },
      },
      {
        gamePk: 3,
        gameDate: '2026-10-20T18:00:00Z',
        seriesDescription: 'World Series',
        seriesGameNumber: 1,
        gamesInSeries: 7,
        status: { abstractGameState: 'Preview' },
        teams: {
          away: {
            team: { id: 9003, name: 'Higher Seed League Champion' },
            score: null,
            isWinner: null,
          },
          home: {
            team: { id: 9004, name: 'Lower Seed League Champion' },
            score: null,
            isWinner: null,
          },
        },
      },
    ]);
    const service = new BracketService({ store, fetchSchedule, bedrockInvoker: invoker });

    const bracket = await service.getBracket(2026);

    expect(bracket.season).toBe(2026);
    expect(bracket.series).toHaveLength(3);
    // The real Final game (1-0 in a best-of-3) resolves to a Wild Card series
    // with the known team ids and no clinch yet.
    const wildCard = bracket.series.find((s) => s.round === 'Wild Card');
    expect(wildCard?.high.teamId).toBe(117);
    expect(wildCard?.status).toBe('in_progress');
    // The placeholder-team series still aggregate (ids unknown to TEAMS is OK)
    // without throwing, preserving their placeholder ids verbatim.
    const allIds = bracket.series.flatMap((s) => [s.high.teamId, s.low.teamId]);
    expect(allIds).toContain(9001);
    expect(allIds).toContain(9003);
    // No win count ever exceeds its clinch count.
    for (const s of bracket.series) {
      const clinch = Math.ceil(s.bestOf / 2);
      expect(s.high.wins).toBeLessThanOrEqual(clinch);
      expect(s.low.wins).toBeLessThanOrEqual(clinch);
    }
  });
});

describe('BracketService.getPrediction (regular-season win pct wiring)', () => {
  // current2026Bracket: high 117, low 116; low (116) leads 2-0 so it is the
  // favorite. 117 is therefore the underdog.
  it('passes a real standings-derived winPct into predict and surfaces metrics', async () => {
    const store = memoryStore(current2026Bracket);
    const standings = {
      records: [
        {
          teamRecords: [
            { team: { id: 116, name: 'Detroit Tigers' }, winningPercentage: '.600' },
            { team: { id: 117, name: 'Houston Astros' }, winningPercentage: '.540' },
          ],
        },
      ],
    };
    const fetchStandings = vi.fn().mockResolvedValue(standings);
    const bedrockInvoke = vi.fn().mockResolvedValue('narrative text');
    const service = new BracketService({
      store,
      fetchSchedule: vi.fn(),
      fetchStandings,
      bedrockInvoker: { invoke: bedrockInvoke },
    });

    const response = await service.getPrediction('2026-al-wildcard-117-116', 2026);

    expect(response.mode).toBe('prediction');
    if (response.mode === 'prediction') {
      expect(response.favoriteTeamId).toBe(116);
      expect(response.metrics).toEqual({
        favorite: { teamId: 116, winPct: 0.6 },
        underdog: { teamId: 117, winPct: 0.54 },
      });
    }
    // A cache miss triggers a live fetch and a write-back.
    expect(fetchStandings).toHaveBeenCalledWith(2026);
    expect(store.putCachedStandings).toHaveBeenCalledOnce();
  });

  it('falls back to neutral (null metrics) and still predicts when fetchStandings throws', async () => {
    const store = memoryStore(current2026Bracket);
    const fetchStandings = vi.fn().mockRejectedValue(new Error('network down'));
    const bedrockInvoke = vi.fn().mockResolvedValue('narrative text');
    const service = new BracketService({
      store,
      fetchSchedule: vi.fn(),
      fetchStandings,
      bedrockInvoker: { invoke: bedrockInvoke },
    });

    const response = await service.getPrediction('2026-al-wildcard-117-116', 2026);

    // Acceptance criterion (1): a failed fetch degrades to a prediction with
    // neutral (null) metrics rather than erroring.
    expect(response.mode).toBe('prediction');
    if (response.mode === 'prediction') {
      expect(response.favoriteTeamId).toBe(116);
      expect(response.metrics).toEqual({
        favorite: { teamId: 116, winPct: null },
        underdog: { teamId: 117, winPct: null },
      });
    }
    expect(fetchStandings).toHaveBeenCalledOnce();
    expect(store.putCachedStandings).not.toHaveBeenCalled();
  });

  it('uses a standings cache hit without calling fetchStandings', async () => {
    const store = memoryStore(current2026Bracket, { 116: 0.58, 117: 0.52 });
    const fetchStandings = vi.fn();
    const bedrockInvoke = vi.fn().mockResolvedValue('narrative text');
    const service = new BracketService({
      store,
      fetchSchedule: vi.fn(),
      fetchStandings,
      bedrockInvoker: { invoke: bedrockInvoke },
    });

    const response = await service.getPrediction('2026-al-wildcard-117-116', 2026);

    expect(response.mode).toBe('prediction');
    if (response.mode === 'prediction') {
      expect(response.metrics).toEqual({
        favorite: { teamId: 116, winPct: 0.58 },
        underdog: { teamId: 117, winPct: 0.52 },
      });
    }
    // Cache hit short-circuits: no live fetch and no write-back.
    expect(fetchStandings).not.toHaveBeenCalled();
    expect(store.getCachedStandings).toHaveBeenCalledWith(2026);
    expect(store.putCachedStandings).not.toHaveBeenCalled();
  });
});

/** A small captured linescore fixture used by the getGameDetail tests. */
const linescoreRaw = {
  innings: [
    { num: 1, ordinalNum: '1st', away: { runs: 1, hits: 2, errors: 0 }, home: { runs: 0, hits: 1, errors: 0 } },
  ],
  teams: {
    away: { runs: 1, hits: 2, errors: 0 },
    home: { runs: 0, hits: 1, errors: 0 },
  },
};

/** feed/live for a FINAL game (completed -> long TTL). */
const finalFeedLiveRaw = {
  gameData: { venue: { name: 'Yankee Stadium' }, status: { abstractGameState: 'Final' } },
  liveData: {
    decisions: { winner: { fullName: 'Gerrit Cole' }, loser: { fullName: 'Tarik Skubal' } },
  },
};

/** feed/live for an IN-PROGRESS game (live -> short TTL). */
const liveFeedLiveRaw = {
  gameData: { venue: { name: 'Dodger Stadium' }, status: { abstractGameState: 'Live' } },
  liveData: { decisions: {} },
};

const contentRaw = {
  editorial: { recap: { mlb: { url: 'https://mlb.com/recap/900001', headline: 'Walk-off win' } } },
};

describe('BracketService.getGameDetail', () => {
  it('returns the cached detail on a hit WITHOUT calling the fetchers (criterion 1)', async () => {
    const cached: GameDetailResponse = {
      status: 'ok',
      gamePk: 900001,
      gameState: 'Final',
      venue: 'Yankee Stadium',
      innings: [],
      totals: {
        away: { runs: 1, hits: 2, errors: 0 },
        home: { runs: 0, hits: 1, errors: 0 },
      },
      pitchers: { winner: 'Gerrit Cole' },
    };
    const store = memoryStore(undefined, undefined, cached);
    const fetchGameLinescore = vi.fn();
    const fetchGameFeedLive = vi.fn();
    const fetchGameContent = vi.fn();
    const service = new BracketService({
      store,
      fetchGameLinescore,
      fetchGameFeedLive,
      fetchGameContent,
      bedrockInvoker: invoker,
    });

    const detail = await service.getGameDetail(900001);

    expect(detail).toEqual(cached);
    expect(fetchGameLinescore).not.toHaveBeenCalled();
    expect(fetchGameFeedLive).not.toHaveBeenCalled();
    expect(fetchGameContent).not.toHaveBeenCalled();
    expect(store.putCachedGameDetail).not.toHaveBeenCalled();
  });

  it('fetches, parses, and writes back with the LONG TTL for a Final game (criterion 1)', async () => {
    const store = memoryStore();
    const fetchGameLinescore = vi.fn().mockResolvedValue(linescoreRaw);
    const fetchGameFeedLive = vi.fn().mockResolvedValue(finalFeedLiveRaw);
    const fetchGameContent = vi.fn().mockResolvedValue(contentRaw);
    const service = new BracketService({
      store,
      fetchGameLinescore,
      fetchGameFeedLive,
      fetchGameContent,
      bedrockInvoker: invoker,
    });

    const detail = await service.getGameDetail(900001);

    expect(detail.status).toBe('ok');
    if (detail.status === 'ok') {
      expect(detail.gamePk).toBe(900001);
      expect(detail.gameState).toBe('Final');
      expect(detail.venue).toBe('Yankee Stadium');
      expect(detail.innings).toHaveLength(1);
      expect(detail.pitchers).toEqual({ winner: 'Gerrit Cole', loser: 'Tarik Skubal' });
      expect(detail.highlight).toEqual({ title: 'Walk-off win', url: 'https://mlb.com/recap/900001' });
    }
    expect(fetchGameLinescore).toHaveBeenCalledWith(900001);
    expect(fetchGameFeedLive).toHaveBeenCalledWith(900001);
    // A completed game is cached with the LONG TTL.
    expect(store.putCachedGameDetail).toHaveBeenCalledOnce();
    const [, ttlSeconds] = (store.putCachedGameDetail as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(ttlSeconds).toBe(GAME_DETAIL_FINAL_TTL_SECONDS);
  });

  it('writes back with the SHORT TTL for an in-progress game (criterion 1)', async () => {
    const store = memoryStore();
    const fetchGameLinescore = vi.fn().mockResolvedValue(linescoreRaw);
    const fetchGameFeedLive = vi.fn().mockResolvedValue(liveFeedLiveRaw);
    const fetchGameContent = vi.fn().mockResolvedValue({});
    const service = new BracketService({
      store,
      fetchGameLinescore,
      fetchGameFeedLive,
      fetchGameContent,
      bedrockInvoker: invoker,
    });

    const detail = await service.getGameDetail(900002);

    expect(detail.status).toBe('ok');
    if (detail.status === 'ok') {
      expect(detail.gameState).toBe('Live');
      expect(detail.highlight).toBeUndefined();
    }
    expect(store.putCachedGameDetail).toHaveBeenCalledOnce();
    const [, ttlSeconds] = (store.putCachedGameDetail as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(ttlSeconds).toBe(GAME_DETAIL_LIVE_TTL_SECONDS);
    // The LONG and SHORT TTLs genuinely differ by game state.
    expect(GAME_DETAIL_LIVE_TTL_SECONDS).not.toBe(GAME_DETAIL_FINAL_TTL_SECONDS);
  });

  it('returns {status:unavailable} on an upstream failure without throwing or caching (criterion 2)', async () => {
    const store = memoryStore();
    const fetchGameLinescore = vi.fn().mockRejectedValue(new Error('mlb down'));
    const fetchGameFeedLive = vi.fn().mockResolvedValue(finalFeedLiveRaw);
    const fetchGameContent = vi.fn();
    const service = new BracketService({
      store,
      fetchGameLinescore,
      fetchGameFeedLive,
      fetchGameContent,
      bedrockInvoker: invoker,
    });

    const detail = await service.getGameDetail(900003);

    expect(detail).toEqual({ status: 'unavailable', gamePk: 900003 });
    // The unavailable fallback is NEVER cached.
    expect(store.putCachedGameDetail).not.toHaveBeenCalled();
  });

  it('still yields an ok response (no highlight) when the content fetch fails', async () => {
    const store = memoryStore();
    const fetchGameLinescore = vi.fn().mockResolvedValue(linescoreRaw);
    const fetchGameFeedLive = vi.fn().mockResolvedValue(finalFeedLiveRaw);
    const fetchGameContent = vi.fn().mockRejectedValue(new Error('content down'));
    const service = new BracketService({
      store,
      fetchGameLinescore,
      fetchGameFeedLive,
      fetchGameContent,
      bedrockInvoker: invoker,
    });

    const detail = await service.getGameDetail(900004);

    expect(detail.status).toBe('ok');
    if (detail.status === 'ok') {
      expect(detail.highlight).toBeUndefined();
      expect(detail.gameState).toBe('Final');
    }
    // A content failure does not prevent the write-back of the ok detail.
    expect(store.putCachedGameDetail).toHaveBeenCalledOnce();
  });
});
