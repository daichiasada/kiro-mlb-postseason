import { describe, expect, it } from 'vitest';
import { buildOgImageSvg, escapeXml } from './ogImage.js';
import { predict } from './predict.js';
import { SHARE_DISCLAIMER } from './share.js';
import { TEAMS, type Bracket, type Series } from './types.js';

/** Dodgers (119) vs Yankees (147), both mapped teams with known names/colors. */
function makeSeries(overrides: Partial<Series> = {}): Series {
  return {
    id: 'ws-2024',
    round: 'World Series',
    league: 'WS',
    high: { teamId: 119, wins: 3 },
    low: { teamId: 147, wins: 1 },
    bestOf: 7,
    status: 'in_progress',
    games: [],
    ...overrides,
  };
}

describe('buildOgImageSvg', () => {
  const series = makeSeries();
  const svg = buildOgImageSvg({ series, season: 2024, lang: 'en' });

  it('is a 1200x630 SVG with the right viewBox', () => {
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('width="1200"');
    expect(svg).toContain('height="630"');
    expect(svg).toContain('viewBox="0 0 1200 630"');
    expect(svg.endsWith('</svg>')).toBe(true);
  });

  it('includes both team names', () => {
    expect(svg).toContain(TEAMS[119].name);
    expect(svg).toContain(TEAMS[147].name);
  });

  it('includes the series score (high.wins-low.wins)', () => {
    expect(svg).toContain('>3-1<');
  });

  it('includes the model win-probability percentage', () => {
    const { favoriteWinProbability } = predict(series, { season: 2024, updatedAt: '', series: [series] } as Bracket);
    const percent = `${Math.round(favoriteWinProbability * 100)}%`;
    expect(svg).toContain(percent);
  });

  it('includes the exact localized disclaimer for en and ja', () => {
    expect(svg).toContain(SHARE_DISCLAIMER.en);
    const svgJa = buildOgImageSvg({ series, season: 2024, lang: 'ja' });
    expect(svgJa).toContain(SHARE_DISCLAIMER.ja);
  });

  it('renders a placeholder for unknown team ids', () => {
    const unknown = makeSeries({ high: { teamId: 424242, wins: 2 }, low: { teamId: 147, wins: 0 } });
    expect(buildOgImageSvg({ series: unknown, season: 2024, lang: 'en' })).toContain('Team 424242');
  });

  it('XML-escapes interpolated text', () => {
    expect(escapeXml('A & B <c> "d" \'e\'')).toBe('A &amp; B &lt;c&gt; &quot;d&quot; &apos;e&apos;');
    // A crafted team name must not inject raw markup into the SVG.
    const crafted = { ...TEAMS, 424242: { id: 424242, name: 'Evil<script>', league: 'AL' as const } };
    const orig = TEAMS[424242];
    (TEAMS as Record<number, (typeof TEAMS)[number]>)[424242] = crafted[424242];
    try {
      const out = buildOgImageSvg({
        series: makeSeries({ high: { teamId: 424242, wins: 1 }, low: { teamId: 147, wins: 0 } }),
        season: 2024,
        lang: 'en',
      });
      expect(out).toContain('Evil&lt;script&gt;');
      expect(out).not.toContain('Evil<script>');
    } finally {
      if (orig) (TEAMS as Record<number, (typeof TEAMS)[number]>)[424242] = orig;
      else delete (TEAMS as Record<number, (typeof TEAMS)[number]>)[424242];
    }
  });
});
