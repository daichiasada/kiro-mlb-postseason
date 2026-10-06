/** A single calendar event to serialize into an iCalendar (.ics) document. */
export interface IcsEvent {
  /** Globally-unique event id (becomes the VEVENT `UID`). */
  uid: string;
  /** Event start as an ISO-8601 instant (e.g. `2024-10-01T18:32:00Z`). */
  start: string;
  /** Event length in minutes; defaults to {@link DEFAULT_DURATION_MINUTES}. */
  durationMinutes?: number;
  /** Short title (VEVENT `SUMMARY`). */
  summary: string;
  /** Optional longer text (VEVENT `DESCRIPTION`). */
  description?: string;
  /**
   * Optional `DTSTAMP` instant. Injected so the output is deterministic in
   * tests; when omitted it is derived from `start` rather than `Date.now()`,
   * keeping {@link buildIcs} a pure input -> output function.
   */
  dtstamp?: string;
}

/** Default game length when a caller does not specify one. */
export const DEFAULT_DURATION_MINUTES = 180;

/** PRODID advertised in the generated calendar. */
const PRODID = '-//MLB Postseason//EN';

/**
 * Formats an instant as an RFC5545 UTC "basic format" timestamp
 * (`YYYYMMDDTHHMMSSZ`). Returns null for an unparseable instant so callers can
 * decide how to degrade.
 */
function toIcsUtc(iso: string): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    return null;
  }
  const d = new Date(ms);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/**
 * Escapes a text value per RFC5545 §3.3.11: backslashes first, then
 * semicolons, commas, and newlines, so the delimiters stay unambiguous.
 */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Builds a minimal, valid iCalendar document wrapping a single VEVENT.
 *
 * Deterministic by construction: `DTSTART`/`DTEND` are rendered in UTC basic
 * format, `DTSTAMP` is the injected stamp or (failing that) `start`, and no
 * ambient clock or timezone is read. Text fields are RFC5545-escaped. Lines are
 * joined with CRLF as the spec requires. Throws only when `start` is
 * unparseable, since an event with no valid start cannot be serialized.
 */
export function buildIcs(event: IcsEvent): string {
  const dtStart = toIcsUtc(event.start);
  if (dtStart === null) {
    throw new Error(`buildIcs: unparseable start "${event.start}"`);
  }

  const durationMinutes = event.durationMinutes ?? DEFAULT_DURATION_MINUTES;
  const endMs = Date.parse(event.start) + durationMinutes * 60_000;
  const dtEnd = toIcsUtc(new Date(endMs).toISOString());
  const dtStamp = toIcsUtc(event.dtstamp ?? event.start) ?? dtStart;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'BEGIN:VEVENT',
    `UID:${escapeText(event.uid)}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeText(event.summary)}`,
  ];

  if (event.description !== undefined) {
    lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');

  return lines.join('\r\n');
}
