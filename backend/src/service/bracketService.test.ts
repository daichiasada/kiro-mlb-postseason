import { describe, expect, it, vi } from 'vitest';
import { getSeedBracket, type Bracket } from '@mlb/shared';
import { BracketService } from './bracketService.js';
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
