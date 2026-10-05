import type { Page, Route } from '@playwright/test';

/**
 * A 2026 in-progress World Series used to stub the `/bracket?season=2026`
 * endpoint. The default season is the current year (2026) which has no offline
 * seed, so the predictable-season e2e flow stubs a real-looking bracket to make
 * the prediction UI deterministic. The series id matches the stubbed prediction
 * below so clicking "Predict winner" resolves against it.
 */
export const SAMPLE_2026_SERIES_ID = '2026-ws-worldseries-119-147';

/**
 * A FINISHED (status==='final') 2026 ALCS used to exercise the per-series
 * game-detail toggle and the finished-series detail PAGE deterministically
 * within the predictable 2026 season. Houston (117) beat Seattle (136) 4-2.
 */
export const SAMPLE_2026_FINAL_SERIES_ID = '2026-al-championship-117-136';

/**
 * A Division Series between two UNKNOWN/preview team ids (not in the TEAMS
 * map), mirroring the real 2026 live-data case that previously leaked a raw
 * "Team 5513" string. The i18n layer must render a LOCALIZED placeholder
 * (EN "TBD (#5513)" / JA "未定 (#5513)") instead.
 */
export const SAMPLE_2026_UNKNOWN_SERIES_ID = '2026-nl-division-5513-5599';
export const SAMPLE_2026_UNKNOWN_TEAM_ID = 5513;

/**
 * An in-progress NLCS used to exercise the local start-time + .ics affordance
 * and the "Today's / tomorrow's games" section (Issue #20). It carries one
 * timed upcoming game (concrete `startTime`) and one time-TBD game (`timeTbd`).
 * The upcoming game's `startTime` is injected relative to the current clock by
 * {@link stubBracket2026WithGameTimes} so the today/tomorrow bucketing is
 * deterministic in the e2e runner regardless of its timezone.
 */
export const SAMPLE_2026_UPCOMING_SERIES_ID = '2026-nl-championship-119-158';
export const SAMPLE_2026_UPCOMING_TIMED_GAME_PK = 810001;
export const SAMPLE_2026_UPCOMING_TBD_GAME_PK = 810002;

export const SAMPLE_2026_BRACKET = {
  season: 2026,
  updatedAt: '2026-10-25T00:00:00.000Z',
  series: [
    {
      id: SAMPLE_2026_SERIES_ID,
      round: 'World Series',
      league: 'WS',
      // Los Angeles Dodgers (119) lead the New York Yankees (147) in progress.
      high: { teamId: 119, wins: 2 },
      low: { teamId: 147, wins: 1 },
      bestOf: 7,
      status: 'in_progress',
      games: [],
    },
    {
      id: SAMPLE_2026_FINAL_SERIES_ID,
      round: 'Championship Series',
      league: 'AL',
      // Houston Astros (117) beat the Seattle Mariners (136) 4-2.
      high: { teamId: 117, wins: 4 },
      low: { teamId: 136, wins: 2 },
      bestOf: 7,
      status: 'final',
      games: [
        {
          gamePk: 800001,
          date: '2026-10-12',
          // Full ISO UTC first pitch; the UI renders this in the viewer's zone.
          startTime: '2026-10-12T20:08:00.000Z',
          away: { teamId: 136, score: 3, isWinner: false },
          home: { teamId: 117, score: 5, isWinner: true },
          seriesGameNumber: 1,
        },
        {
          gamePk: 800002,
          date: '2026-10-13',
          startTime: '2026-10-13T20:08:00.000Z',
          away: { teamId: 136, score: 2, isWinner: false },
          home: { teamId: 117, score: 4, isWinner: true },
          seriesGameNumber: 2,
        },
      ],
    },
    {
      id: SAMPLE_2026_UNKNOWN_SERIES_ID,
      round: 'Division Series',
      league: 'NL',
      // Both ids are NOT in TEAMS (the real preview-data case): must render as
      // a localized "TBD/未定 (#id)" placeholder, never "Team 5513".
      high: { teamId: SAMPLE_2026_UNKNOWN_TEAM_ID, wins: 1 },
      low: { teamId: 5599, wins: 0 },
      bestOf: 5,
      status: 'in_progress',
      games: [],
    },
  ],
};

/**
 * A realistic Prediction JSON matching the `mode: 'prediction'` variant of
 * `@mlb/shared`'s PredictionResponse, used to stub the `/prediction` endpoint
 * (which has no offline fallback) so the success path can be asserted
 * deterministically for the 2026 predictable season.
 */
export const SAMPLE_PREDICTION = {
  mode: 'prediction' as const,
  seriesId: SAMPLE_2026_SERIES_ID,
  // Los Angeles Dodgers (119) are the favorite over the Yankees (147).
  favoriteTeamId: 119,
  favoriteWinProbability: 0.68,
  narrative:
    'The Dodgers enter the World Series with a deep rotation and a relentless ' +
    'lineup. Expect Los Angeles to control the series tempo and close it out ' +
    'behind clutch late-inning hitting.',
  model: 'anthropic.claude-3-haiku',
  generatedAt: '2026-10-25T00:00:00.000Z',
  // Additive regular-season metrics the model used, split by role (favorite vs
  // underdog). The UI surfaces these as the explainable "prediction basis".
  metrics: {
    favorite: { teamId: 119, winPct: 0.605 },
    underdog: { teamId: 147, winPct: 0.58 },
  },
};

/** Routes `**\/bracket*` for 2026 to a real-looking in-progress bracket. */
export async function stubBracket2026(page: Page): Promise<void> {
  await page.route('**/bracket*', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SAMPLE_2026_BRACKET),
    });
  });
}

/**
 * Routes `**\/bracket*` to the 2026 bracket PLUS an extra in-progress NLCS whose
 * timed game's `startTime` is a few hours from the current clock, so the game
 * always buckets into "today or tomorrow" and the "Today's / tomorrow's games"
 * section renders deterministically regardless of the e2e runner's timezone or
 * run time. The NLCS also carries a time-TBD game (no `startTime`) so the
 * TBD/Time-TBD path and the absence of a calendar affordance can be asserted.
 *
 * The extra series is appended only in THIS stub (not in the shared
 * SAMPLE_2026_BRACKET) so the keyboard/layout specs that assume the fixed
 * 3-series bracket stay unaffected.
 */
export async function stubBracket2026WithGameTimes(page: Page): Promise<void> {
  // Three hours from now, truncated to whole seconds, as a full ISO UTC string.
  const soon = new Date(Date.now() + 3 * 60 * 60 * 1000);
  soon.setMilliseconds(0);
  const soonIso = soon.toISOString();

  const upcomingSeries = {
    id: SAMPLE_2026_UPCOMING_SERIES_ID,
    round: 'Championship Series',
    league: 'NL',
    // Los Angeles Dodgers (119) vs Atlanta Braves (158), series underway.
    high: { teamId: 119, wins: 1 },
    low: { teamId: 158, wins: 1 },
    bestOf: 7,
    status: 'in_progress',
    games: [
      {
        gamePk: SAMPLE_2026_UPCOMING_TIMED_GAME_PK,
        date: soonIso.slice(0, 10),
        // A concrete, upcoming first pitch relative to the current clock.
        startTime: soonIso,
        away: { teamId: 158, score: null, isWinner: null },
        home: { teamId: 119, score: null, isWinner: null },
        seriesGameNumber: 3,
      },
      {
        gamePk: SAMPLE_2026_UPCOMING_TBD_GAME_PK,
        date: '2026-10-21',
        // Start time not yet scheduled: renders a localized "Time TBD" and
        // exposes NO calendar affordance.
        timeTbd: true,
        away: { teamId: 158, score: null, isWinner: null },
        home: { teamId: 119, score: null, isWinner: null },
        seriesGameNumber: 4,
      },
    ],
  };

  const bracket = {
    ...SAMPLE_2026_BRACKET,
    series: [...SAMPLE_2026_BRACKET.series, upcomingSeries],
  };

  await page.route('**/bracket*', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(bracket),
    });
  });
}

/** Routes `**\/prediction*` to a successful prediction response. */
export async function stubPredictionSuccess(page: Page): Promise<void> {
  await page.route('**/prediction*', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SAMPLE_PREDICTION),
    });
  });
}

/** Routes `**\/prediction*` to an error so the error/alert UI can be asserted. */
export async function stubPredictionError(
  page: Page,
  status = 500,
): Promise<void> {
  await page.route('**/prediction*', async (route: Route) => {
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Prediction service unavailable' }),
    });
  });
}

/**
 * Routes `**\/prediction*`, recording every requested `accuracy` query param
 * (in order) and echoing it back in the response so the UI can be asserted to
 * update per accuracy. The returned array is mutated as requests arrive, so a
 * test can poll it after changing the accuracy control.
 *
 * The echoed probability is a deterministic function of accuracy clamped to
 * [0.5, 0.95]: p = 0.5 + 0.4 * accuracy (so the displayed percentage visibly
 * changes with the slider), matching the backend's "higher accuracy => higher
 * favorite probability" semantics.
 */
export async function stubPredictionCapturingAccuracy(
  page: Page,
): Promise<string[]> {
  const captured: string[] = [];
  await page.route('**/prediction*', async (route: Route) => {
    const url = new URL(route.request().url());
    const accuracyParam = url.searchParams.get('accuracy');
    captured.push(accuracyParam ?? '');
    const accuracy = accuracyParam === null ? 0.5 : Number(accuracyParam);
    const safe = Number.isFinite(accuracy)
      ? Math.min(1, Math.max(0, accuracy))
      : 0.5;
    const probability = Math.min(0.95, Math.max(0.5, 0.5 + 0.4 * safe));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...SAMPLE_PREDICTION,
        favoriteWinProbability: Number(probability.toFixed(4)),
      }),
    });
  });
  return captured;
}

/** A single captured `/prediction` request's localization/model params. */
export interface CapturedPredictionRequest {
  lang: string | null;
  model: string | null;
}

/**
 * Routes `**\/prediction*`, recording every request's `lang` AND `model` query
 * params (in order). The returned array is mutated as requests arrive, so a
 * test can poll it after toggling the language or selecting a model. Mirrors
 * {@link stubPredictionCapturingAccuracy} but for the FEAT-004 localization and
 * model-selection params.
 */
export async function stubPredictionCapturingLangModel(
  page: Page,
): Promise<CapturedPredictionRequest[]> {
  const captured: CapturedPredictionRequest[] = [];
  await page.route('**/prediction*', async (route: Route) => {
    const url = new URL(route.request().url());
    captured.push({
      lang: url.searchParams.get('lang'),
      model: url.searchParams.get('model'),
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(SAMPLE_PREDICTION),
    });
  });
  return captured;
}

/**
 * Routes `**\/bracket*` to the 2026 bracket but with a non-empty
 * `integrityWarnings` array attached to the response body, simulating the
 * FEAT-003 backend surfacing a finished matchup that still references a
 * placeholder/undetermined team. The frontend reads the field verbatim.
 */
export async function stubBracket2026WithIntegrityWarnings(
  page: Page,
): Promise<void> {
  await page.route('**/bracket*', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...SAMPLE_2026_BRACKET,
        integrityWarnings: [
          {
            code: 'finished_game_tbd_team',
            seriesId: SAMPLE_2026_FINAL_SERIES_ID,
            round: 'Championship Series',
            league: 'AL',
            teamId: SAMPLE_2026_UNKNOWN_TEAM_ID,
            scope: 'series',
          },
        ],
      }),
    });
  });
}
