import type { Bracket, GameResult, Series } from '@mlb/shared';

/** Which calendar-day bucket a game falls into, relative to `now`. */
export type GameDayBucket = 'today' | 'tomorrow' | 'past' | 'future';

/** A game paired with the series it belongs to, for upcoming-section rendering. */
export interface UpcomingGame {
  series: Series;
  game: GameResult;
  bucket: 'today' | 'tomorrow';
}

/** The parts of a countdown to first pitch, each clamped at 0. */
export interface CountdownParts {
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
}

/**
 * Extracts the `YYYY-MM-DD` calendar day of an instant AS SEEN in a given IANA
 * time zone, using {@link Intl.DateTimeFormat}. This is the crux of local-tz
 * bucketing: an instant late on Oct 1 UTC is already Oct 2 in Asia/Tokyo, so
 * comparing raw UTC dates would mis-bucket games (the date-shift bug the issue
 * calls out). Returns a `{ y, m, d }` numeric triple for direct comparison.
 */
function localYmd(
  instant: Date,
  timeZone: string,
): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);

  const get = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value);

  return { y: get('year'), m: get('month'), d: get('day') };
}

/** Days since an arbitrary epoch for a local y-m-d triple, for day-diff math. */
function dayNumber({ y, m, d }: { y: number; m: number; d: number }): number {
  // UTC here is a pure counting device for the (already tz-resolved) calendar
  // triple; it carries no timezone meaning of its own.
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/**
 * Buckets a game's start instant into today/tomorrow/past/future by comparing
 * its LOCAL calendar day (in `timeZone`) against `now`'s local calendar day.
 * Pure: both the game instant and `now` are resolved in the injected zone, so
 * the result is deterministic regardless of the host's ambient timezone.
 */
export function bucketGameDay(
  startTime: string,
  now: Date,
  timeZone: string,
): GameDayBucket {
  const ms = Date.parse(startTime);
  if (Number.isNaN(ms)) {
    return 'future';
  }

  const gameDay = dayNumber(localYmd(new Date(ms), timeZone));
  const nowDay = dayNumber(localYmd(now, timeZone));
  const diff = gameDay - nowDay;

  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff < 0) return 'past';
  return 'future';
}

/**
 * Collects the games happening today or tomorrow (in `timeZone`) across every
 * series in the bracket, in series order then game order. Games without a
 * concrete start time (`timeTbd` or missing `startTime`) are skipped: they have
 * no local day to bucket and would otherwise render a bogus "today".
 */
export function selectUpcomingGames(
  bracket: Bracket,
  now: Date,
  timeZone: string,
): UpcomingGame[] {
  const upcoming: UpcomingGame[] = [];

  for (const series of bracket.series) {
    for (const game of series.games) {
      if (game.timeTbd || game.startTime === undefined) {
        continue;
      }
      const bucket = bucketGameDay(game.startTime, now, timeZone);
      if (bucket === 'today' || bucket === 'tomorrow') {
        upcoming.push({ series, game, bucket });
      }
    }
  }

  return upcoming;
}

/**
 * Breaks the remaining time until first pitch into whole days/hours/minutes for
 * a countdown display. Past or unparseable instants clamp every part (and
 * `totalMs`) to 0, so the UI never shows a negative or "started N minutes ago"
 * countdown. Pure: the caller injects `now`.
 */
export function countdownParts(startTime: string, now: Date): CountdownParts {
  const ms = Date.parse(startTime);
  const zero: CountdownParts = { totalMs: 0, days: 0, hours: 0, minutes: 0 };
  if (Number.isNaN(ms)) {
    return zero;
  }

  const totalMs = Math.max(0, ms - now.getTime());
  if (totalMs === 0) {
    return zero;
  }

  const totalMinutes = Math.floor(totalMs / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  return { totalMs, days, hours, minutes };
}
