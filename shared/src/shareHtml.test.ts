import { describe, expect, it } from 'vitest';
import { buildShareHtml, escapeHtml } from './shareHtml.js';
import { SHARE_DISCLAIMER } from './share.js';
import { TEAMS, type Series } from './types.js';

function makeSeries(): Series {
  return {
    id: 'ws-2024',
    round: 'World Series',
    league: 'WS',
    high: { teamId: 119, wins: 3 },
    low: { teamId: 147, wins: 1 },
    bestOf: 7,
    status: 'in_progress',
    games: [],
  };
}

const APP_URL = 'https://app.example.com/season/2024/series/ws-2024?lang=en';
const OG_IMAGE_URL = 'https://api.example.com/og?season=2024&seriesId=ws-2024&lang=en';
const CANONICAL_URL = 'https://app.example.com/share/season/2024/series/ws-2024?lang=en';

describe('buildShareHtml', () => {
  const html = buildShareHtml({
    series: makeSeries(),
    season: 2024,
    lang: 'en',
    appUrl: APP_URL,
    ogImageUrl: OG_IMAGE_URL,
    canonicalUrl: CANONICAL_URL,
  });

  it('is a complete HTML document with the requested lang attribute', () => {
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<html lang="en">');
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
  });

  it('emits og:type, og:title, og:description, og:image, og:url', () => {
    expect(html).toContain('<meta property="og:type" content="website"/>');
    expect(html).toContain('<meta property="og:title"');
    expect(html).toContain('<meta property="og:description"');
    expect(html).toContain(`<meta property="og:image" content="${escapeHtml(OG_IMAGE_URL)}"/>`);
    expect(html).toContain(`<meta property="og:url" content="${escapeHtml(CANONICAL_URL)}"/>`);
  });

  it('emits twitter card tags', () => {
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image"/>');
    expect(html).toContain('<meta name="twitter:title"');
    expect(html).toContain('<meta name="twitter:description"');
    expect(html).toContain(`<meta name="twitter:image" content="${escapeHtml(OG_IMAGE_URL)}"/>`);
  });

  it('includes the disclaimer in og:description and the visible body', () => {
    // og:description content and the <p> summary both carry the disclaimer.
    const occurrences = html.split(SHARE_DISCLAIMER.en).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('includes both team names and the score', () => {
    expect(html).toContain(TEAMS[119].name);
    expect(html).toContain(TEAMS[147].name);
    expect(html).toContain('3-1');
  });

  it('redirects a human via meta-refresh and location.replace to appUrl', () => {
    expect(html).toContain(`<meta http-equiv="refresh" content="0;url=${escapeHtml(APP_URL)}"/>`);
    expect(html).toContain(`location.replace(${JSON.stringify(APP_URL)})`);
    expect(html).toContain(`<a href="${escapeHtml(APP_URL)}">`);
  });

  it('localizes the disclaimer for ja', () => {
    const ja = buildShareHtml({
      series: makeSeries(),
      season: 2024,
      lang: 'ja',
      appUrl: APP_URL,
      ogImageUrl: OG_IMAGE_URL,
      canonicalUrl: CANONICAL_URL,
    });
    expect(ja).toContain('<html lang="ja">');
    expect(ja).toContain(SHARE_DISCLAIMER.ja);
  });

  it('HTML-escapes interpolated values', () => {
    expect(escapeHtml('a & b <c> "d" \'e\'')).toBe('a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39;');
  });
});
