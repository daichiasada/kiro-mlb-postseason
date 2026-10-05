import { describe, it, expect } from 'vitest';
import type { Bracket, GameResult, Series } from '@mlb/shared';
import {
  bucketGameDay,
  countdownParts,
  selectUpcomingGames,
} from './upcomingGames';

/**
 * Fixed reference instant: 2024-10-01T12:00:00Z. In Asia/Tokyo (UTC+9) that is
 * already 2024-10-01 21:00 local; in America/New_York (EDT) it is 08:00 local.
 */
const NOW = new Date('2024-10-01T12:00:00.000Z');

const TOKYO = 'Asia/Tokyo';
const NEW_YORK = 'America/New_York';

describe('bucketGameDay', () => {
  it('classifies the same local day as "today"', () => {
    // 2024-10-01 18:00 Tokyo local (09:00Z).
    expect(bucketGameDay('2024-10-01T09:00:00Z', NOW, TOKYO)).toBe('today');
  });

  it('classifies the next local day as "tomorrow"', () => {
    // 2024-10-02 06:00 Tokyo local (2024-10-01 21:00Z).
    expect(bucketGameDay('2024-10-01T21:00:00Z', NOW, TOKYO)).toBe('tomorrow');
  });

  it('classifies an earlier local day as "past"', () => {
    expect(bucketGameDay('2024-09-30T09:00:00Z', NOW, TOKYO)).toBe('past');
  });

  it('classifies a far-later local day as "future"', () => {
    expect(bucketGameDay('2024-10-05T09:00:00Z', NOW, TOKYO)).toBe('future');
  });

  it('buckets by LOCAL day, not UTC day (date-shift case)', () => {
    // Instant 2024-10-01T16:00:00Z: still Oct 1 in UTC, but 2024-10-02 01:00
    // in Asia/Tokyo. Relative to NOW (Oct 1 local in Tokyo) it is TOMORROW,
    // whereas a naive UTC-date comparison would wrongly call it "today".
    const instant = '2024-10-01T16:00:00Z';
    expect(bucketGameDay(instant, NOW, TOKYO)).toBe('tomorrow');
    // The very same instant is 12:00 on Oct 1 in New York => still "today".
    expect(bucketGameDay(instant, NOW, NEW_YORK)).toBe('today');
  });

  it('treats an unparseable start time as "future" rather than throwing', () => {
    expect(bucketGameDay('not-a-date', NOW, TOKYO)).toBe('future');
  });
});

function game(partial: Partial<GameResult> & { gamePk: number }): GameResult {
  return {
    date: '2024-10-01',
    away: { teamId: 116, score: null, isWinner: null },
    home: { teamId: 117, score: null, isWinner: null },
    seriesGameNumber: 1,
    ...partial,
  };
}

function series(id: string, games: GameResult[]): Series {
  return {
    id,
    round: 'Wild Card',
    league: 'AL',
    high: { teamId: 117, wins: 0 },
    low: { teamId: 116, wins: 0 },
    bestOf: 3,
    status: 'scheduled',
    games,
  };
}

describe('selectUpcomingGames', () => {
  it('returns today/tomorrow games across series and skips TBD/undefined starts', () => {
    const bracket: Bracket = {
      season: 2024,
      updatedAt: NOW.toISOString(),
      series: [
        series('s1', [
          game({ gamePk: 1, startTime: '2024-10-01T09:00:00Z' }), // today (Tokyo)
          game({ gamePk: 2, startTime: '2024-10-01T21:00:00Z' }), // tomorrow (Tokyo)
          game({ gamePk: 3, startTime: '2024-09-30T09:00:00Z' }), // past
          game({ gamePk: 4, startTime: '2024-10-10T09:00:00Z' }), // future
        ]),
        series('s2', [
          // TBD / undefined-start games must be skipped entirely.
          game({ gamePk: 5, timeTbd: true, startTime: '2024-10-01T09:00:00Z' }),
          game({ gamePk: 6 }), // no startTime at all
          game({ gamePk: 7, startTime: '2024-10-01T09:30:00Z' }), // today
        ]),
      ],
    };

    const upcoming = selectUpcomingGames(bracket, NOW, TOKYO);
    const pks = upcoming.map((u) => u.game.gamePk);

    expect(pks).toEqual([1, 2, 7]);
    expect(upcoming.find((u) => u.game.gamePk === 1)?.bucket).toBe('today');
    expect(upcoming.find((u) => u.game.gamePk === 2)?.bucket).toBe('tomorrow');
    expect(upcoming.find((u) => u.game.gamePk === 7)?.bucket).toBe('today');
    expect(upcoming[0]?.series.id).toBe('s1');
  });
});

describe('countdownParts', () => {
  it('breaks a known delta into days/hours/minutes', () => {
    // 2 days, 3 hours, 15 minutes ahead of NOW.
    const deltaMs = (2 * 24 * 60 + 3 * 60 + 15) * 60_000;
    const start = new Date(NOW.getTime() + deltaMs).toISOString();
    expect(countdownParts(start, NOW)).toEqual({
      totalMs: deltaMs,
      days: 2,
      hours: 3,
      minutes: 15,
    });
  });

  it('clamps a past instant to all zeros', () => {
    const start = new Date(NOW.getTime() - 60 * 60_000).toISOString();
    expect(countdownParts(start, NOW)).toEqual({
      totalMs: 0,
      days: 0,
      hours: 0,
      minutes: 0,
    });
  });

  it('clamps an unparseable instant to all zeros', () => {
    expect(countdownParts('not-a-date', NOW)).toEqual({
      totalMs: 0,
      days: 0,
      hours: 0,
      minutes: 0,
    });
  });
});
