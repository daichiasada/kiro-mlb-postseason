import { describe, it, expect } from 'vitest';
import { formatStartTime } from './gameTime';

/**
 * A fixed UTC instant: 2024-10-01T18:32:00Z. In Asia/Tokyo (UTC+9) this is
 * 2024-10-02 03:32 (Wednesday); in America/New_York (EDT, UTC-4) it is still
 * 2024-10-01 14:32 (Tuesday). The two zones therefore disagree on both the
 * local hour AND the calendar day, which proves the conversion.
 */
const INSTANT = '2024-10-01T18:32:00Z';

const TBD = 'Time TBD';

describe('formatStartTime', () => {
  it('converts the instant into Asia/Tokyo local time', () => {
    const ja = formatStartTime(INSTANT, {
      lang: 'ja',
      timeZone: 'Asia/Tokyo',
      tbdLabel: TBD,
    });
    // 03:32 local on Oct 2 (Wednesday) in Tokyo. 24-hour clock for ja.
    expect(ja).toContain('3:32');
    expect(ja).toContain('2'); // day-of-month 2
    expect(ja).toContain('水'); // Wednesday (short weekday)
  });

  it('converts the SAME instant into America/New_York local time', () => {
    const en = formatStartTime(INSTANT, {
      lang: 'en',
      timeZone: 'America/New_York',
      tbdLabel: TBD,
    });
    // 2:32 PM local on Oct 1 (Tuesday) in New York. 12-hour clock for en.
    expect(en).toContain('2:32');
    expect(en).toContain('PM');
    expect(en).toContain('Tue');
    expect(en).toContain('Oct');
  });

  it('renders distinct EN vs JA formats for the same zone', () => {
    const en = formatStartTime(INSTANT, {
      lang: 'en',
      timeZone: 'Asia/Tokyo',
      tbdLabel: TBD,
    });
    const ja = formatStartTime(INSTANT, {
      lang: 'ja',
      timeZone: 'Asia/Tokyo',
      tbdLabel: TBD,
    });
    // Same instant/zone, different locale => different rendering.
    expect(en).not.toBe(ja);
    // EN uses a 12-hour clock with an AM/PM marker; JA does not.
    expect(en).toContain('AM');
    expect(ja).not.toContain('AM');
  });

  it('returns the localized label when timeTbd is true', () => {
    expect(
      formatStartTime(INSTANT, {
        lang: 'en',
        timeZone: 'Asia/Tokyo',
        timeTbd: true,
        tbdLabel: TBD,
      }),
    ).toBe(TBD);
  });

  it('returns the localized label when startTime is undefined', () => {
    expect(
      formatStartTime(undefined, {
        lang: 'ja',
        timeZone: 'Asia/Tokyo',
        tbdLabel: TBD,
      }),
    ).toBe(TBD);
  });

  it('returns the localized label (never throws) for an unparseable start', () => {
    expect(
      formatStartTime('not-a-date', {
        lang: 'en',
        timeZone: 'America/New_York',
        tbdLabel: TBD,
      }),
    ).toBe(TBD);
  });
});
