# Requirements - MLB Postseason Summary Site

Spec-driven development artifact. These requirements use EARS-style acceptance
criteria (WHEN/THEN, plus IF/THEN for error paths) and describe the system that
is actually implemented in this repository, not a hypothetical one.

## Introduction

A lightweight, serverless, public read-only web app that gives a graphical
summary of the MLB postseason and an AI-assisted win/loss prediction for any
series. Built end to end in TypeScript and deployed to AWS with one command via
AWS CDK.

## Requirement 1 - Graphical bracket view across multiple seasons

**User story:** As a baseball fan, I want to see the postseason as a graphical
bracket for any of the recent seasons, so that I can understand how teams
advance from the Wild Card round through the World Series at a glance.

The app is year-aware. Its notion of "now" is a single current year
(`CURRENT_YEAR = 2026`) defined once in `@mlb/shared`, and the selectable
seasons are `[2026, 2025, 2024]` (newest-first). The default season is the
current year.

### Acceptance criteria

1. WHEN the SPA loads THEN the system SHALL request the aggregated bracket for
   the current default season (the shared `CURRENT_YEAR`, 2026) from
   `GET /bracket?season=YYYY`, and WHEN no `season` query is supplied to the
   backend THEN it SHALL default to `CURRENT_YEAR`.
2. WHEN the SPA renders THEN it SHALL show a labeled season selector listing the
   selectable seasons (2026, 2025, 2024) with the current season preselected.
3. WHEN a user picks a different season in the selector THEN the system SHALL
   re-fetch the bracket for that season and clear any previously selected
   series.
4. WHEN the bracket is returned THEN the system SHALL render each series with
   both teams, the current series score (`high.wins` vs `low.wins`), the round,
   the league (`AL | NL | WS`), and the status (`scheduled | in_progress |
   final`).
5. WHEN series are rendered THEN the system SHALL order them by round
   progression (Wild Card, Division Series, Championship Series, World Series).
6. WHEN a user opens a series THEN the system SHALL show the game-by-game
   results for that series, for both results-only and current seasons.
7. IF the current season (2026) has not started yet (no series has a decided
   game - the bracket is empty, placeholder-only, or every series is `scheduled`
   including preview-only series that carry not-yet-played "Preview" games with
   null scores/winners) THEN the system SHALL show an "has not started yet"
   message instead of a broken bracket, and SHALL NOT error.
8. IF the viewport is narrow THEN the bracket SHALL NOT overflow horizontally
   (regression fixed under ISSUE in the issue registry).

## Requirement 2 - Win/loss prediction for the current season only

**User story:** As a fan, I want a predicted favorite and win probability for a
series in the in-progress season, so that I can see who is likely to advance and
why, while past seasons simply show their final results.

The prediction feature is offered only for the current, predictable season
(`season === CURRENT_YEAR`). Seasons strictly before the current year are
results-only: the interactive prediction UI is hidden and the `/prediction`
endpoint returns a results-only response instead of a numeric prediction.

The `/prediction` endpoint returns a discriminated union
(`PredictionResponse`) with HTTP 200 for all three cases, and the frontend
branches on `mode`:

- `mode: 'prediction'` - a full numeric prediction (favorite, probability, and
  Bedrock narrative) for a resolvable, started series in the current season.
- `mode: 'results'` - a results-only response for a completed season.
- `mode: 'upcoming'` - a graceful "no prediction yet" response for the current
  season when the series is not resolvable yet or has not started.

### Acceptance criteria

1. WHEN a user requests a prediction for a current-season series THEN the system
   SHALL call `GET /prediction?seriesId=...&season=YYYY` (or the equivalent POST
   body).
2. WHEN a prediction is computed THEN `favoriteWinProbability` SHALL be within
   the inclusive range `[0.5, 0.95]`.
3. WHEN a prediction is computed THEN `favoriteTeamId` SHALL be one of the two
   teams in the requested series.
4. WHEN the series is even on wins THEN the system SHALL break the tie toward
   the high seed using a small home-field edge.
5. WHEN the frontend renders a results-only season (2024, 2025) THEN it SHALL
   hide the interactive prediction panel and the per-series "Predict winner"
   button (showing a non-interactive "View details" affordance and a "Final
   results" treatment instead), so a user cannot trigger a prediction the
   backend will not produce.
6. WHEN `/prediction` is called for a results-only season (`season <
   CURRENT_YEAR`) THEN the system SHALL respond `200` with
   `{ mode: 'results', seriesId, season, message }` and SHALL short-circuit
   BEFORE loading the bracket, running the prediction model, or invoking
   Bedrock.
7. WHEN `/prediction` is called for the current season but the series is not
   resolvable yet (empty or placeholder-only bracket) or has not started
   (status `scheduled`) THEN the system SHALL respond `200` with
   `{ mode: 'upcoming', seriesId, season, message }` rather than an error.
8. WHEN `/prediction` produces a numeric prediction THEN the system SHALL
   respond `200` with a body tagged `mode: 'prediction'` carrying the full
   `Prediction` fields.
9. IF `seriesId` is missing or empty THEN the system SHALL respond `400`.
10. IF the `season` query is present but not a 4-digit year THEN the system
    SHALL respond `400`.

## Requirement 3 - AI narrative with graceful fallback

**User story:** As a fan, I want a short natural-language explanation of the
prediction, so that the numeric probability is easy to understand.

### Acceptance criteria

1. WHEN a prediction is produced THEN the system SHALL generate a 2-3 sentence
   narrative via Amazon Bedrock (Anthropic Claude) describing why the favorite
   is favored.
2. IF the Bedrock call fails for any reason (throttling, access, parse error)
   THEN the system SHALL return a deterministic templated fallback narrative and
   SHALL NOT fail the prediction request.
3. WHEN the fallback is used THEN the response `model` field SHALL be suffixed
   with `(fallback)` so the source is transparent.
4. WHEN running tests THEN the Bedrock call SHALL be mockable through the
   `BedrockInvoker` interface and SHALL make no live calls.

## Requirement 4 - MLB data strategy (cache + live + seed fallback)

**User story:** As an operator, I want the bracket data to be fast, resilient,
and cheap, so that the site stays up even when the upstream MLB API is slow or
unreachable.

### Acceptance criteria

1. WHEN a bracket is requested THEN the system SHALL first read the DynamoDB
   cache keyed by season (`pk = BRACKET#<season>`), and WHEN a cache hit exists
   THEN it SHALL return the cached bracket.
2. WHEN there is no cache hit THEN the system SHALL fetch the live MLB Stats API
   postseason schedule, aggregate it into the bracket shape, write it to the
   cache (with a TTL), and return it.
3. IF the live MLB fetch fails AND a bundled seed exists for the season THEN
   the system SHALL return that seed. `getSeedBracket` serves BOTH the 2024 seed
   (Dodgers over Yankees 4-1) AND the 2025 seed (Dodgers over Blue Jays 4-3);
   the 2025 seed is real data aggregated from the live MLB Stats API, and
   returns `undefined` for any other season.
4. IF the live MLB fetch fails AND no seed exists for the season (e.g. the
   current 2026 season) THEN the system SHALL rethrow so the handler responds
   `500`.
5. WHEN games are aggregated THEN they SHALL be grouped into series by
   `(seriesDescription + unordered team pair)` and the high seed SHALL be the
   home team of game 1.
6. WHEN aggregating a current-season (2026) schedule that contains placeholder
   teams for not-yet-determined rounds (e.g. "AL Higher Seed", "Higher Seed
   League Champion") THEN aggregation SHALL tolerate team ids absent from the
   `TEAMS` map without throwing, and the frontend SHALL render such teams via a
   `Team <id>` fallback name.

## Requirement 5 - One-command deploy (Infrastructure as Code)

**User story:** As a developer, I want to provision and deploy the entire stack
with one command, so that the project is reproducible and demo-ready.

### Acceptance criteria

1. WHEN `npm run deploy` is run with active AWS credentials THEN AWS CDK SHALL
   provision S3 + CloudFront (private bucket via OAC), an API Gateway HTTP API,
   two Node 20 Lambdas (`getBracket`, `getPrediction`), a DynamoDB table, and
   the Bedrock IAM permissions.
2. WHEN the frontend is built THEN the API base URL SHALL be injected at runtime
   via a `/config.js` asset (`window.__API_BASE_URL__`), not hard-coded.
3. WHEN `npm run synth` is run THEN CDK SHALL produce a valid CloudFormation
   template with no errors and without requiring AWS credentials.
4. WHEN deploying THEN the DynamoDB table SHALL have TTL enabled so cached
   brackets expire and refresh.

## Requirement 6 - Clean, aligned bracket layout

**User story:** As a fan, I want the bracket to look tidy with its columns and
cards aligned, so that it is easy to read and does not look broken ("gatagata").

The uneven layout was caused by each series card always rendering its full
inline game-by-game list, which gave cards wildly different heights. Collapsing
that list by default (see Requirement 7) equalizes card heights and is the
primary fix.

### Acceptance criteria

1. WHEN the bracket renders THEN the round columns SHALL be top-aligned and the
   series cards within a column SHALL have consistent spacing so headers, team
   rows, and meta lines line up across columns (no vertical "gatagata" drift).
2. WHEN one card's game detail is expanded THEN the other columns SHALL NOT be
   misaligned (the CSS grid rows absorb the height change).
3. WHEN the viewport is at tablet width (<= 860px) THEN the bracket SHALL show
   two columns, and WHEN it is at phone width (<= 560px) THEN it SHALL collapse
   to a single column.
4. WHEN the viewport is narrow (e.g. 375px) THEN the document SHALL NOT scroll
   horizontally.

## Requirement 7 - Collapsible, collapsed-by-default game detail

**User story:** As a fan, I want each series' game-by-game list hidden behind a
toggle that starts collapsed, so that the bracket stays compact and I expand
detail only when I want it.

### Acceptance criteria

1. WHEN a series card with at least one game renders THEN the system SHALL show
   a per-series toggle button and SHALL keep the game-by-game list COLLAPSED by
   default.
2. WHEN a user activates the toggle THEN the system SHALL reveal the game list,
   flip the button's `aria-expanded` to `true`, and change its localized label
   from "Show games"/"試合を表示" to "Hide games"/"試合を隠す" (and back on a
   second activation).
3. WHEN the toggle controls the list THEN it SHALL reference the list via
   `aria-controls` using an id that is valid in both CSS selectors and
   assistive tech (React `useId()` colons stripped).

## Requirement 8 - Finished-series detail page via client-side routing

**User story:** As a fan, I want to open a dedicated detail page for a finished
series, so that I can review its full game-by-game result on its own screen and
share a deep link to it.

The SPA uses path-based (history) client-side routing via `react-router-dom`
v6 `BrowserRouter`. Path-based routing (not hash routing) is compatible with the
deployment because CloudFront already rewrites 403/404 responses to
`/index.html` with HTTP 200, so deep links resolve to the SPA.

### Acceptance criteria

1. WHEN the SPA mounts THEN it SHALL expose the routes `/` (redirect to
   `/season/{CURRENT_YEAR}`), `/season/:season` (the bracket landing page), and
   `/season/:season/series/:seriesId` (the series detail page); an unknown path
   SHALL redirect to the default season.
2. WHEN a series is finished (`status === 'final'`) THEN its card SHALL expose a
   link to `/season/{season}/series/{encodeURIComponent(seriesId)}`.
3. WHEN a user opens a series detail URL (via the link OR as a direct deep link)
   THEN the system SHALL re-fetch the bracket for the route's season, find the
   series by id, and render its teams, per-game scores, winner, and series
   result, plus a back link to the bracket for the same season.
4. IF the series id in the URL does not exist in that season's bracket THEN the
   system SHALL render a friendly "Series not found" region with a return link
   instead of erroring.

## Requirement 9 - Finished series: prediction turned OFF at the series level

**User story:** As a fan, I do not want a speculative numeric prediction for a
series that has already finished; I want its final result instead, even within
the current, otherwise-predictable season.

This gating is enforced on BOTH tiers: the backend never computes a prediction
for a final series, and the frontend never offers or displays one.

### Acceptance criteria

1. WHEN `/prediction` is called for a series whose resolved `status === 'final'`
   THEN the system SHALL respond `200` with `{ mode: 'results', ... }` and SHALL
   NOT call the prediction model or invoke Bedrock, EVEN WHEN the season is the
   current predictable year (`CURRENT_YEAR`).
2. WHEN the finished-series gating applies THEN it SHALL take effect AFTER the
   existing results-only-season short-circuit and resolve the series from the
   bracket before checking its status.
3. WHEN a finished series renders on the bracket in the current season THEN the
   frontend SHALL NOT render the interactive "Predict winner" button and SHALL
   surface the detail-page link instead.
4. WHEN a finished series is reached in the UI THEN the frontend SHALL NOT
   display a numeric win probability for it (no `progressbar` is shown).

## Requirement 10 - Japanese / English language switch (i18n)

**User story:** As a bilingual fan, I want to switch the interface between
Japanese and English, so that I can read it in my preferred language.

The i18n layer is a lightweight in-repo React context (NO new runtime
dependency) with a flat dotted-key message dictionary. The default language is
Japanese (`ja`) because the site's feature requests arrived in Japanese; the
choice is persisted to `localStorage` under the key `mlb.lang`.

### Acceptance criteria

1. WHEN the SPA loads THEN it SHALL default to Japanese, OR to the previously
   chosen language when a valid value is stored in `localStorage['mlb.lang']`.
2. WHEN a user toggles the header language control THEN the system SHALL switch
   ALL user-facing UI strings live (title/subtitle, season label, statuses,
   round names, legend, standings, prediction panel incl. the accuracy control,
   game-detail toggle, and detail page) and SHALL indicate the active language
   accessibly via `aria-pressed`.
3. WHEN the user changes the language THEN the system SHALL persist the choice
   to `localStorage` so it survives a reload; `localStorage` access SHALL be
   guarded so a missing/throwing store does not break rendering.
4. WHEN a team id is NOT present in the `TEAMS` map (an unknown/preview id) THEN
   the system SHALL render a LOCALIZED placeholder - EN `TBD (#<id>)`, JA
   `未定 (#<id>)` - and SHALL NEVER leak a raw `Team <id>` string, including in
   abbreviation (game-score) positions.

## Requirement 11 - Configurable prediction model accuracy

**User story:** As a fan exploring the model, I want to tune how confident the
prediction is, so that I can see a more aggressive or more conservative favorite
probability while trusting the result stays within sane bounds.

`accuracy` is a sharpness/temperature control in the inclusive range `[0, 1]`
with a default of `0.5`. It is threaded end to end: a localized slider in the
prediction panel -> the `&accuracy=` query param -> the backend handler ->
`BracketService.getPrediction` -> the pure `predict()` function.

The transform: the favorite's raw blended score share is clamped to `[0.5,
0.95]` (`p0`), then sharpened around the conservative floor by a factor `f = 2 *
accuracy` as `p = 0.5 + (p0 - 0.5) * f`, then clamped again to `[0.5, 0.95]`.

### Acceptance criteria

1. WHEN `accuracy` is omitted THEN the system SHALL use the default `0.5`, which
   makes `f = 1` an identity transform and reproduces the model's historical
   output exactly.
2. WHEN `accuracy` increases for a given favored series THEN
   `favoriteWinProbability` SHALL be monotonically non-decreasing (more
   confident toward `0.95`), and WHEN it decreases THEN the probability SHALL
   soften toward `0.5` (`accuracy = 0` collapses the favorite to exactly `0.5`).
3. WHEN any `accuracy` value in or beyond the supported range is supplied THEN
   `favoriteWinProbability` SHALL remain within `[0.5, 0.95]`, `favoriteTeamId`
   SHALL be unchanged, and the result SHALL stay deterministic (verified by
   fast-check property tests). A non-finite `accuracy` SHALL fall back to the
   default; an out-of-range value SHALL be clamped to `[0, 1]`.
4. WHEN the `/prediction` endpoint receives `accuracy` via the GET query OR the
   POST body THEN it SHALL forward it to the model; a missing or invalid
   `accuracy` SHALL be treated as undefined (so the model default applies) and
   SHALL NEVER cause a `400`.
5. WHEN the user changes the prediction panel's accuracy slider THEN the
   frontend SHALL issue a new `/prediction` request carrying the chosen
   `accuracy` (debounced while dragging) and SHALL update the displayed
   favorite/probability/narrative, keeping the existing loading/error states.
   The slider SHALL default to `0.5` so the initial behavior is unchanged, and
   SHALL have an accessible, localized label with a visible current value.
