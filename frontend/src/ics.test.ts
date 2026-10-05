import { describe, it, expect } from 'vitest';
import { buildIcs } from './ics';

describe('buildIcs', () => {
  const ics = buildIcs({
    uid: 'game-775345@mlb-postseason',
    start: '2024-10-01T18:32:00Z',
    summary: 'Tigers at Astros, Game 1',
    description: 'AL Wild Card Series',
  });

  const lines = ics.split('\r\n');

  it('wraps the event in a VCALENDAR with VERSION and PRODID', () => {
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain('VERSION:2.0');
    expect(lines).toContain('PRODID:-//MLB Postseason//EN');
    expect(lines).toContain('BEGIN:VEVENT');
    expect(lines).toContain('END:VEVENT');
    expect(lines[lines.length - 1]).toBe('END:VCALENDAR');
  });

  it('is CRLF-separated', () => {
    expect(ics).toContain('\r\n');
    expect(ics).not.toMatch(/[^\r]\n/); // no bare LF
  });

  it('emits the exact UTC DTSTART line', () => {
    expect(lines).toContain('DTSTART:20241001T183200Z');
  });

  it('computes DTEND from the default 180-minute duration', () => {
    // 18:32Z + 180 min = 21:32Z.
    expect(lines).toContain('DTEND:20241001T213200Z');
  });

  it('derives a deterministic DTSTAMP from start when none is injected', () => {
    expect(lines).toContain('DTSTAMP:20241001T183200Z');
  });

  it('honors an injected dtstamp', () => {
    const withStamp = buildIcs({
      uid: 'u',
      start: '2024-10-01T18:32:00Z',
      summary: 's',
      dtstamp: '2024-09-30T00:00:00Z',
    });
    expect(withStamp.split('\r\n')).toContain('DTSTAMP:20240930T000000Z');
  });

  it('honors an explicit duration', () => {
    const short = buildIcs({
      uid: 'u',
      start: '2024-10-01T18:32:00Z',
      summary: 's',
      durationMinutes: 90,
    });
    // 18:32Z + 90 min = 20:02Z.
    expect(short.split('\r\n')).toContain('DTEND:20241001T200200Z');
  });

  it('escapes commas in the SUMMARY line', () => {
    expect(lines).toContain('SUMMARY:Tigers at Astros\\, Game 1');
  });

  it('emits the UID line verbatim', () => {
    expect(lines).toContain('UID:game-775345@mlb-postseason');
  });

  it('escapes semicolons, backslashes and newlines per RFC5545', () => {
    const escaped = buildIcs({
      uid: 'u',
      start: '2024-10-01T18:32:00Z',
      summary: 'a;b\\c\nd',
    });
    expect(escaped.split('\r\n')).toContain('SUMMARY:a\\;b\\\\c\\nd');
  });

  it('throws for an unparseable start', () => {
    expect(() =>
      buildIcs({ uid: 'u', start: 'not-a-date', summary: 's' }),
    ).toThrow();
  });
});
