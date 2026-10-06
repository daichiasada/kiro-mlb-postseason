import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from './relativeTime';

/** Fixed reference instant used across the buckets below. */
const NOW = new Date('2026-10-10T12:00:00.000Z');

/** Returns an ISO string `ms` milliseconds before NOW. */
function agoIso(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatRelativeTime', () => {
  it('renders a sub-minute diff as "now" in both languages', () => {
    expect(formatRelativeTime(agoIso(0), NOW, 'en')).toBe('now');
    expect(formatRelativeTime(agoIso(30 * SECOND), NOW, 'en')).toBe('now');
    expect(formatRelativeTime(agoIso(0), NOW, 'ja')).toBe('今');
    expect(formatRelativeTime(agoIso(30 * SECOND), NOW, 'ja')).toBe('今');
  });

  it('renders minutes in both languages', () => {
    expect(formatRelativeTime(agoIso(MINUTE), NOW, 'en')).toBe('1 minute ago');
    expect(formatRelativeTime(agoIso(5 * MINUTE), NOW, 'en')).toBe(
      '5 minutes ago',
    );
    expect(formatRelativeTime(agoIso(MINUTE), NOW, 'ja')).toBe('1 分前');
    expect(formatRelativeTime(agoIso(5 * MINUTE), NOW, 'ja')).toBe('5 分前');
  });

  it('renders hours in both languages', () => {
    expect(formatRelativeTime(agoIso(HOUR), NOW, 'en')).toBe('1 hour ago');
    expect(formatRelativeTime(agoIso(3 * HOUR), NOW, 'en')).toBe('3 hours ago');
    expect(formatRelativeTime(agoIso(HOUR), NOW, 'ja')).toBe('1 時間前');
    expect(formatRelativeTime(agoIso(3 * HOUR), NOW, 'ja')).toBe('3 時間前');
  });

  it('renders days in both languages', () => {
    expect(formatRelativeTime(agoIso(DAY), NOW, 'en')).toBe('yesterday');
    expect(formatRelativeTime(agoIso(3 * DAY), NOW, 'en')).toBe('3 days ago');
    expect(formatRelativeTime(agoIso(DAY), NOW, 'ja')).toBe('昨日');
    expect(formatRelativeTime(agoIso(3 * DAY), NOW, 'ja')).toBe('3 日前');
  });

  it('clamps a FUTURE timestamp (clock skew) to "now"', () => {
    const future = new Date(NOW.getTime() + 5 * MINUTE).toISOString();
    expect(formatRelativeTime(future, NOW, 'en')).toBe('now');
    expect(formatRelativeTime(future, NOW, 'ja')).toBe('今');
  });

  it('renders an invalid timestamp as "now" rather than throwing', () => {
    expect(formatRelativeTime('not-a-date', NOW, 'en')).toBe('now');
    expect(formatRelativeTime('', NOW, 'ja')).toBe('今');
  });
});
