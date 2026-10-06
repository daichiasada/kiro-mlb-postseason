/**
 * Pure, side-effect-free parsers that narrow the raw MLB Stats API game-detail
 * JSON (linescore, feed/live, content) into the shared {@link GameDetailResponse}
 * contract.
 *
 * Every parser tolerates missing/omitted fields: a missing runs/hits/errors maps
 * to `null`, missing decisions/venue are simply omitted, and the optional
 * highlight parser returns `undefined` (never throws) when the recap link is
 * absent. These functions perform NO network or AWS access.
 */
import type {
  GameDetailResponse,
  GameHighlight,
  GamePitchers,
  InningLine,
  LineScoreSide,
  LineScoreTotals,
} from '@mlb/shared';

/** One raw run/hit/error side of a linescore inning or totals row. */
interface RawLineScoreSide {
  runs?: number | null;
  hits?: number | null;
  errors?: number | null;
}

/** A single raw inning from the MLB linescore response. */
interface RawInning {
  num?: number;
  ordinalNum?: string;
  home?: RawLineScoreSide;
  away?: RawLineScoreSide;
}

/** The subset of the MLB linescore response consumed by {@link parseLinescore}. */
export interface RawLinescoreResponse {
  innings?: RawInning[];
  teams?: {
    home?: RawLineScoreSide;
    away?: RawLineScoreSide;
  };
}

/** A pitcher decision entry from feed/live `liveData.decisions`. */
interface RawDecision {
  fullName?: string;
}

/** The subset of the MLB feed/live response consumed by {@link parseGameMeta}. */
export interface RawFeedLiveResponse {
  gameData?: {
    venue?: { name?: string };
    status?: { abstractGameState?: string };
  };
  liveData?: {
    decisions?: {
      winner?: RawDecision;
      loser?: RawDecision;
      save?: RawDecision;
    };
  };
}

/** The subset of the MLB content response consumed by {@link parseHighlight}. */
export interface RawContentResponse {
  editorial?: {
    recap?: {
      mlb?: { url?: string; headline?: string };
    };
  };
}

/** Normalizes a numeric field to a number or `null` when missing/non-numeric. */
function num(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Narrows a raw run/hit/error side to the defensive {@link LineScoreSide}. */
function side(raw: RawLineScoreSide | undefined): LineScoreSide {
  return {
    runs: num(raw?.runs),
    hits: num(raw?.hits),
    errors: num(raw?.errors),
  };
}

/**
 * Parses the MLB linescore response into inning-by-inning lines and the game
 * totals row. Missing innings yield an empty array; missing run/hit/error
 * fields map to `null`.
 */
export function parseLinescore(raw: RawLinescoreResponse): {
  innings: InningLine[];
  totals: LineScoreTotals;
} {
  const innings: InningLine[] = (raw.innings ?? []).map((inning) => {
    const line: InningLine = {
      inning: num(inning.num) ?? 0,
      away: side(inning.away),
      home: side(inning.home),
    };
    if (typeof inning.ordinalNum === 'string' && inning.ordinalNum !== '') {
      line.ordinal = inning.ordinalNum;
    }
    return line;
  });

  const totals: LineScoreTotals = {
    away: side(raw.teams?.away),
    home: side(raw.teams?.home),
  };

  return { innings, totals };
}

/**
 * Parses the MLB feed/live response into the game state, venue, and pitcher
 * decisions. A missing `abstractGameState` falls back to the empty string; the
 * venue and any absent decision (frequently `save`) are omitted.
 */
export function parseGameMeta(raw: RawFeedLiveResponse): {
  gameState: string;
  venue?: string;
  pitchers: GamePitchers;
} {
  const gameState = raw.gameData?.status?.abstractGameState ?? '';
  const venueName = raw.gameData?.venue?.name;

  const decisions = raw.liveData?.decisions;
  const pitchers: GamePitchers = {};
  if (decisions?.winner?.fullName) pitchers.winner = decisions.winner.fullName;
  if (decisions?.loser?.fullName) pitchers.loser = decisions.loser.fullName;
  if (decisions?.save?.fullName) pitchers.save = decisions.save.fullName;

  const result: { gameState: string; venue?: string; pitchers: GamePitchers } = {
    gameState,
    pitchers,
  };
  if (typeof venueName === 'string' && venueName !== '') {
    result.venue = venueName;
  }
  return result;
}

/**
 * Parses the OPTIONAL MLB content response into a recap highlight link. Returns
 * `undefined` (never throws) when the recap block or its url is absent, so a
 * best-effort content fetch never fails the overall call.
 */
export function parseHighlight(raw: RawContentResponse): GameHighlight | undefined {
  const recap = raw.editorial?.recap?.mlb;
  const url = recap?.url;
  if (typeof url !== 'string' || url === '') {
    return undefined;
  }
  const headline = recap?.headline;
  const title = typeof headline === 'string' && headline !== '' ? headline : url;
  return { title, url };
}

/**
 * Assembles an `ok` {@link GameDetailResponse} from the three parsed pieces. The
 * highlight is included only when present.
 */
export function buildGameDetail(
  gamePk: number,
  linescore: { innings: InningLine[]; totals: LineScoreTotals },
  meta: { gameState: string; venue?: string; pitchers: GamePitchers },
  highlight?: GameHighlight,
): GameDetailResponse {
  const detail: GameDetailResponse = {
    status: 'ok',
    gamePk,
    gameState: meta.gameState,
    innings: linescore.innings,
    totals: linescore.totals,
    pitchers: meta.pitchers,
  };
  if (meta.venue !== undefined) detail.venue = meta.venue;
  if (highlight !== undefined) detail.highlight = highlight;
  return detail;
}
