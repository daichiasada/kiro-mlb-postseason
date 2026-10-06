import { describe, it, expect } from 'vitest';
import type { Bracket } from '@mlb/shared';
import {
  buildRoundColumns,
  clinchWins,
  favoriteSummary,
  findTeamSeries,
  isTeamEliminated,
  seriesLeaderId,
  ROUND_ORDER,
} from './bracketLayout';
import {
  inProgressSeries,
  sampleBracket,
  wildCardSeries,
  worldSeries,
} from './test/fixtures';

describe('buildRoundColumns', () => {
  it('orders columns by round progression and only includes populated rounds', () => {
    const columns = buildRoundColumns(sampleBracket);
    expect(columns.map((c) => c.round)).toEqual(['Wild Card', 'World Series']);
    expect(ROUND_ORDER.indexOf(columns[0].round)).toBeLessThan(
      ROUND_ORDER.indexOf(columns[1].round),
    );
  });

  it('places the matching series in its round column', () => {
    const columns = buildRoundColumns(sampleBracket);
    const wc = columns.find((c) => c.round === 'Wild Card');
    expect(wc?.series.map((s) => s.id)).toEqual([wildCardSeries.id]);
  });
});

describe('seriesLeaderId', () => {
  it('returns the leading team id', () => {
    expect(seriesLeaderId(wildCardSeries)).toBe(116); // Tigers lead 2-0
    expect(seriesLeaderId(worldSeries)).toBe(119); // Dodgers lead 4-1
  });

  it('returns null when tied', () => {
    expect(
      seriesLeaderId({ ...wildCardSeries, high: { teamId: 117, wins: 1 }, low: { teamId: 116, wins: 1 } }),
    ).toBeNull();
  });
});

describe('clinchWins', () => {
  it('computes wins needed to clinch', () => {
    expect(clinchWins(3)).toBe(2);
    expect(clinchWins(5)).toBe(3);
    expect(clinchWins(7)).toBe(4);
  });
});

/**
 * A bracket covering every favorite case:
 * - 116 (Tigers) won a final Wild Card => active, not eliminated.
 * - 117 (Astros) lost a final Wild Card => eliminated.
 * - 121 (Mets) are in an in_progress Championship Series => active.
 * - 158 (Brewers) are in the same in_progress series => active.
 * - 119 (Dodgers) won a final World Series => champion.
 * - 147 (Yankees) lost a final World Series => eliminated.
 * - 999 is not in the bracket.
 */
const favoritesBracket: Bracket = {
  season: 2024,
  updatedAt: '2024-10-31T00:00:00.000Z',
  series: [wildCardSeries, inProgressSeries, worldSeries],
};

describe('findTeamSeries', () => {
  it('returns the team series in round order', () => {
    // 119 only appears in the World Series.
    expect(findTeamSeries(favoritesBracket, 119).map((s) => s.id)).toEqual([
      worldSeries.id,
    ]);
    // 121 only appears in the Championship Series.
    expect(findTeamSeries(favoritesBracket, 121).map((s) => s.id)).toEqual([
      inProgressSeries.id,
    ]);
  });

  it('orders a multi-round team by ROUND_ORDER regardless of series array order', () => {
    const multi: Bracket = {
      ...favoritesBracket,
      // World Series listed first, Wild Card last, for team 500.
      series: [
        { ...worldSeries, high: { teamId: 500, wins: 4 }, low: { teamId: 147, wins: 1 } },
        { ...wildCardSeries, high: { teamId: 500, wins: 0 }, low: { teamId: 116, wins: 2 } },
      ],
    };
    expect(findTeamSeries(multi, 500).map((s) => s.round)).toEqual([
      'Wild Card',
      'World Series',
    ]);
  });

  it('returns [] for a team not in the bracket', () => {
    expect(findTeamSeries(favoritesBracket, 999)).toEqual([]);
  });
});

describe('isTeamEliminated', () => {
  it('is true for the loser of a final series', () => {
    expect(isTeamEliminated(favoritesBracket, 117)).toBe(true); // lost WC
    expect(isTeamEliminated(favoritesBracket, 147)).toBe(true); // lost WS
  });

  it('is false for a team that won its final (champion) or is still active', () => {
    expect(isTeamEliminated(favoritesBracket, 119)).toBe(false); // champion
    expect(isTeamEliminated(favoritesBracket, 116)).toBe(false); // won WC
    expect(isTeamEliminated(favoritesBracket, 121)).toBe(false); // in progress
  });

  it('is false for a team not in the bracket', () => {
    expect(isTeamEliminated(favoritesBracket, 999)).toBe(false);
  });
});

describe('favoriteSummary', () => {
  it('reports a champion', () => {
    const s = favoriteSummary(favoritesBracket, 119);
    expect(s).toMatchObject({
      teamId: 119,
      inBracket: true,
      eliminated: false,
      isChampion: true,
      currentSeries: null,
      furthestRound: 'World Series',
    });
    expect(s.record).toBeUndefined();
  });

  it('reports an eliminated team', () => {
    const s = favoriteSummary(favoritesBracket, 147);
    expect(s).toMatchObject({
      teamId: 147,
      inBracket: true,
      eliminated: true,
      isChampion: false,
      furthestRound: 'World Series',
    });
  });

  it('reports an active team with its in_progress series and record', () => {
    const s = favoriteSummary(favoritesBracket, 121);
    expect(s.inBracket).toBe(true);
    expect(s.eliminated).toBe(false);
    expect(s.isChampion).toBe(false);
    expect(s.currentSeries?.id).toBe(inProgressSeries.id);
    expect(s.furthestRound).toBe('Championship Series');
    expect(s.record).toEqual({ wins: 1, losses: 0 });
  });

  it('reports the trailing side record from its own perspective', () => {
    const s = favoriteSummary(favoritesBracket, 158);
    expect(s.record).toEqual({ wins: 0, losses: 1 });
  });

  it('prefers a scheduled series when there is no in_progress series', () => {
    const scheduledBracket: Bracket = {
      ...favoritesBracket,
      series: [
        {
          ...inProgressSeries,
          status: 'scheduled',
          high: { teamId: 121, wins: 0 },
          low: { teamId: 158, wins: 0 },
        },
      ],
    };
    const s = favoriteSummary(scheduledBracket, 121);
    expect(s.currentSeries?.status).toBe('scheduled');
    expect(s.record).toEqual({ wins: 0, losses: 0 });
  });

  it('reports a not-in-bracket team', () => {
    const s = favoriteSummary(favoritesBracket, 999);
    expect(s).toEqual({
      teamId: 999,
      inBracket: false,
      eliminated: false,
      isChampion: false,
      currentSeries: null,
      furthestRound: null,
    });
  });
});
