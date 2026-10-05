import { describe, expect, it } from 'vitest';
import {
  buildGameDetail,
  parseGameMeta,
  parseHighlight,
  parseLinescore,
  type RawContentResponse,
  type RawFeedLiveResponse,
  type RawLinescoreResponse,
} from './gameDetail.js';

/**
 * Small CAPTURED fixtures representing the real MLB Stats API shapes (no live
 * calls). Shapes confirmed against:
 *   - /api/v1/game/{gamePk}/linescore
 *   - /api/v1.1/game/{gamePk}/feed/live
 *   - /api/v1/game/{gamePk}/content
 */
const linescoreFixture: RawLinescoreResponse = {
  innings: [
    { num: 1, ordinalNum: '1st', away: { runs: 1, hits: 2, errors: 0 }, home: { runs: 0, hits: 1, errors: 0 } },
    { num: 2, ordinalNum: '2nd', away: { runs: 0, hits: 0, errors: 0 }, home: { runs: 3, hits: 4, errors: 1 } },
  ],
  teams: {
    away: { runs: 1, hits: 2, errors: 0 },
    home: { runs: 3, hits: 5, errors: 1 },
  },
};

describe('parseLinescore', () => {
  it('maps innings and totals', () => {
    const { innings, totals } = parseLinescore(linescoreFixture);

    expect(innings).toHaveLength(2);
    expect(innings[0]).toEqual({
      inning: 1,
      ordinal: '1st',
      away: { runs: 1, hits: 2, errors: 0 },
      home: { runs: 0, hits: 1, errors: 0 },
    });
    expect(innings[1]?.home).toEqual({ runs: 3, hits: 4, errors: 1 });
    expect(totals).toEqual({
      away: { runs: 1, hits: 2, errors: 0 },
      home: { runs: 3, hits: 5, errors: 1 },
    });
  });

  it('maps missing fields and a missing innings array defensively to null/empty', () => {
    const { innings, totals } = parseLinescore({
      innings: [{ num: 9, away: {}, home: { runs: 2 } }],
      teams: { home: { runs: 5 } },
    });

    expect(innings).toHaveLength(1);
    expect(innings[0]).toEqual({
      inning: 9,
      away: { runs: null, hits: null, errors: null },
      home: { runs: 2, hits: null, errors: null },
    });
    // No ordinal when the API omits ordinalNum.
    expect(innings[0]?.ordinal).toBeUndefined();
    expect(totals.away).toEqual({ runs: null, hits: null, errors: null });
    expect(totals.home).toEqual({ runs: 5, hits: null, errors: null });

    // An entirely empty response yields no innings and null totals.
    const empty = parseLinescore({});
    expect(empty.innings).toEqual([]);
    expect(empty.totals.away).toEqual({ runs: null, hits: null, errors: null });
  });
});

describe('parseGameMeta', () => {
  it('extracts venue, game state, and pitchers when a save is present', () => {
    const feedLive: RawFeedLiveResponse = {
      gameData: {
        venue: { name: 'Yankee Stadium' },
        status: { abstractGameState: 'Final' },
      },
      liveData: {
        decisions: {
          winner: { fullName: 'Gerrit Cole' },
          loser: { fullName: 'Tarik Skubal' },
          save: { fullName: 'Clay Holmes' },
        },
      },
    };

    expect(parseGameMeta(feedLive)).toEqual({
      gameState: 'Final',
      venue: 'Yankee Stadium',
      pitchers: { winner: 'Gerrit Cole', loser: 'Tarik Skubal', save: 'Clay Holmes' },
    });
  });

  it('omits an absent save (and tolerates missing venue/status)', () => {
    const feedLive: RawFeedLiveResponse = {
      gameData: { venue: { name: 'Dodger Stadium' } },
      liveData: {
        decisions: {
          winner: { fullName: 'Walker Buehler' },
          loser: { fullName: 'Zack Wheeler' },
        },
      },
    };

    const meta = parseGameMeta(feedLive);
    expect(meta.gameState).toBe('');
    expect(meta.venue).toBe('Dodger Stadium');
    expect(meta.pitchers).toEqual({ winner: 'Walker Buehler', loser: 'Zack Wheeler' });
    expect(meta.pitchers.save).toBeUndefined();

    // A completely empty feed/live yields a safe empty meta with no venue.
    const empty = parseGameMeta({});
    expect(empty).toEqual({ gameState: '', pitchers: {} });
    expect(empty.venue).toBeUndefined();
  });
});

describe('parseHighlight', () => {
  it('returns the recap link when present', () => {
    const content: RawContentResponse = {
      editorial: {
        recap: { mlb: { url: 'https://mlb.com/recap/123', headline: 'Yankees walk it off' } },
      },
    };

    expect(parseHighlight(content)).toEqual({
      title: 'Yankees walk it off',
      url: 'https://mlb.com/recap/123',
    });
  });

  it('falls back to the url as the title when headline is missing', () => {
    const content: RawContentResponse = {
      editorial: { recap: { mlb: { url: 'https://mlb.com/recap/456' } } },
    };
    expect(parseHighlight(content)).toEqual({
      title: 'https://mlb.com/recap/456',
      url: 'https://mlb.com/recap/456',
    });
  });

  it('returns undefined when the recap link is absent (never throws)', () => {
    expect(parseHighlight({})).toBeUndefined();
    expect(parseHighlight({ editorial: {} })).toBeUndefined();
    expect(parseHighlight({ editorial: { recap: { mlb: {} } } })).toBeUndefined();
  });
});

describe('buildGameDetail', () => {
  it('assembles an ok response and includes an optional highlight', () => {
    const linescore = parseLinescore(linescoreFixture);
    const meta = parseGameMeta({
      gameData: { venue: { name: 'Yankee Stadium' }, status: { abstractGameState: 'Final' } },
      liveData: { decisions: { winner: { fullName: 'Gerrit Cole' } } },
    });
    const detail = buildGameDetail(900001, linescore, meta, {
      title: 'Recap',
      url: 'https://mlb.com/recap/1',
    });

    expect(detail).toEqual({
      status: 'ok',
      gamePk: 900001,
      gameState: 'Final',
      venue: 'Yankee Stadium',
      innings: linescore.innings,
      totals: linescore.totals,
      pitchers: { winner: 'Gerrit Cole' },
      highlight: { title: 'Recap', url: 'https://mlb.com/recap/1' },
    });
  });

  it('omits venue and highlight when absent', () => {
    const linescore = parseLinescore({});
    const meta = parseGameMeta({ gameData: { status: { abstractGameState: 'Live' } } });
    const detail = buildGameDetail(900002, linescore, meta);

    expect(detail.status).toBe('ok');
    if (detail.status === 'ok') {
      expect(detail.venue).toBeUndefined();
      expect(detail.highlight).toBeUndefined();
      expect(detail.gameState).toBe('Live');
    }
  });
});
