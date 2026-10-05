import type { Lang } from './i18n';

/**
 * Pure, localized relative-time formatter for the "last updated" line.
 *
 * Renders a timestamp relative to `now` using the platform
 * {@link Intl.RelativeTimeFormat} with `numeric: 'auto'`, so English reads
 * "2 minutes ago" / "just now" and Japanese reads "2分前" / "今". It is kept
 * dependency-free and side-effect-free so it is trivially unit-testable across
 * both languages and every bucket.
 *
 * Buckets: under a minute => seconds (with 0 clamped to "now"/"今"), under an
 * hour => minutes, under a day => hours, otherwise days. Invalid or FUTURE
 * timestamps are clamped to a zero diff so the UI never shows "in 3 minutes"
 * from a clock skew between the client and the backend `updatedAt`.
 */
export function formatRelativeTime(
  fromIso: string,
  now: Date,
  lang: Lang,
): string {
  const rtf = new Intl.RelativeTimeFormat(lang === 'ja' ? 'ja' : 'en', {
    numeric: 'auto',
  });

  const fromMs = Date.parse(fromIso);
  const nowMs = now.getTime();

  // Guard invalid timestamps and future diffs (clock skew): clamp to "now".
  if (Number.isNaN(fromMs)) {
    return rtf.format(0, 'second');
  }

  const diffMs = Math.max(0, nowMs - fromMs);
  const seconds = Math.floor(diffMs / 1000);

  if (seconds < 60) {
    // numeric:'auto' renders 0 seconds as the idiomatic "now" / "今".
    return rtf.format(0, 'second');
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return rtf.format(-minutes, 'minute');
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return rtf.format(-hours, 'hour');
  }

  const days = Math.floor(hours / 24);
  return rtf.format(-days, 'day');
}
