import { describe, expect, it } from 'vitest';
import { TEAMS } from '../types.js';
import { POSTSEASON_2025, getSeedBracket } from './index.js';

describe('getSeedBracket', () => {
  it('returns a valid bracket for 2024', () => {
    const bracket = getSeedBracket(2024);
    expect(bracket).toBeDefined();
    expect(bracket?.season).toBe(2024);
    expect(bracket?.series.length).toBeGreaterThan(0);
  });

  it('returns a valid bracket for 2025', () => {
    const bracket = getSeedBracket(2025);
    expect(bracket).toBeDefined();
    expect(bracket?.season).toBe(2025);
    expect(bracket?.series.length).toBeGreaterThan(0);
  });

  it('returns undefined for the current and future seasons', () => {
    expect(getSeedBracket(2026)).toBeUndefined();
    expect(getSeedBracket(2027)).toBeUndefined();
  });
});

describe('2025 seed dataset', () => {
  it('covers all four postseason rounds', () => {
    const rounds = new Set(POSTSEASON_2025.series.map((s) => s.round));
    expect(rounds).toEqual(
      new Set(['Wild Card', 'Division Series', 'Championship Series', 'World Series']),
    );
  });

  it('has a stable, deterministic updatedAt (not Date.now)', () => {
    expect(POSTSEASON_2025.updatedAt).toBe('2025-11-02T00:00:00.000Z');
  });

  it('resolves the World Series to the Dodgers (119) as a 4-3 final champion', () => {
    const ws = POSTSEASON_2025.series.find((s) => s.league === 'WS');
    expect(ws).toBeDefined();
    expect(ws?.status).toBe('final');

    // The Dodgers (119) clinched with 4 wins over the Blue Jays (141) who took 3.
    const sides = [ws!.high, ws!.low];
    const dodgers = sides.find((t) => t.teamId === 119);
    const blueJays = sides.find((t) => t.teamId === 141);
    expect(dodgers?.wins).toBe(4);
    expect(blueJays?.wins).toBe(3);

    // The champion is the side that reached 4 wins.
    const champion = dodgers!.wins > blueJays!.wins ? dodgers : blueJays;
    expect(champion?.teamId).toBe(119);
  });

  it('references only teams present in TEAMS', () => {
    const ids = new Set<number>();
    for (const s of POSTSEASON_2025.series) {
      ids.add(s.high.teamId);
      ids.add(s.low.teamId);
      for (const g of s.games) {
        ids.add(g.away.teamId);
        ids.add(g.home.teamId);
      }
    }
    const missing = [...ids].filter((id) => !(id in TEAMS));
    expect(missing).toEqual([]);
  });
});
