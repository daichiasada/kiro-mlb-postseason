import type { Lang } from './i18n';

/** Options for {@link formatStartTime}. */
export interface FormatStartTimeOptions {
  /** UI language, selecting the `ja-JP` vs `en-US` Intl locale. */
  lang: Lang;
  /**
   * IANA time zone the instant is rendered in (e.g. `Asia/Tokyo`). The caller
   * injects this (the app defaults to
   * `Intl.DateTimeFormat().resolvedOptions().timeZone`) so the helper stays
   * pure and deterministic in a non-Japan sandbox.
   */
  timeZone: string;
  /** True when the start time is not yet scheduled; forces the TBD label. */
  timeTbd?: boolean;
  /** Localized "Time TBD" label the caller resolves via `t('gametime.tbd')`. */
  tbdLabel: string;
}

/**
 * Pure, localized first-pitch formatter for a game's start time.
 *
 * Renders a UTC ISO instant in the injected `timeZone` using
 * {@link Intl.DateTimeFormat}, with a distinct format per language: English
 * uses `en-US` with a 12-hour clock, Japanese uses `ja-JP` with a 24-hour
 * clock. Both include the weekday, month and day so the date is unambiguous
 * once converted into the viewer's zone (the issue's date-shift problem).
 *
 * It never throws: when `timeTbd` is true, or `startTime` is undefined or
 * unparseable, it returns the caller-provided localized `tbdLabel` instead of a
 * bogus midnight. Kept dependency-free and side-effect-free so it is trivially
 * unit-testable across both languages, zones, and the TBD path.
 */
export function formatStartTime(
  startTime: string | undefined,
  opts: FormatStartTimeOptions,
): string {
  const { lang, timeZone, timeTbd, tbdLabel } = opts;

  if (timeTbd || startTime === undefined) {
    return tbdLabel;
  }

  const ms = Date.parse(startTime);
  if (Number.isNaN(ms)) {
    return tbdLabel;
  }

  const formatter = new Intl.DateTimeFormat(
    lang === 'ja' ? 'ja-JP' : 'en-US',
    {
      timeZone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: lang !== 'ja',
    },
  );

  return formatter.format(new Date(ms));
}
