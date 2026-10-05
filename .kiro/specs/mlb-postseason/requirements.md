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

## Requirement 3 - Localized AI narrative with selectable model and graceful fallback

**User story:** As a fan, I want a short natural-language explanation of the
prediction in my chosen language and (optionally) from a model I pick, so that
the numeric probability is easy to understand and I can explore different
Amazon Bedrock models.

The narrative is both language-aware (EN/JA) and model-selectable. The selectable
models are a shared allowlist in `@mlb/shared` (`shared/src/narrative.ts`,
`NARRATIVE_MODEL_OPTIONS`): the Amazon Nova family (`us.amazon.nova-micro-v1:0`,
`us.amazon.nova-lite-v1:0`, `us.amazon.nova-pro-v1:0`) plus the Anthropic Claude
Haiku inference profile (`us.anthropic.claude-haiku-4-5-20251001-v1:0`). The
default is **Amazon Nova Lite** (`DEFAULT_NARRATIVE_MODEL_ID = 'us.amazon.nova-lite-v1:0'`),
chosen for its balance of quality, latency, and cost and because it supports both
on-demand and inference-profile invocation. (Amazon Titan has no text-generation
model in us-east-1, embeddings only, so the Amazon-family text options are the
Nova family.) The request/response JSON differs per provider, so the backend
invoker selects a per-provider adapter (Anthropic messages shape vs Amazon Nova
`messages` + `inferenceConfig`).

### Acceptance criteria

1. WHEN a prediction is produced THEN the system SHALL generate a 2-3 sentence
   narrative via Amazon Bedrock describing why the favorite is favored, using
   the request's selected model (default Amazon Nova Lite) and localized to the
   request's language (EN or JA) for both the prompt and the prose.
2. WHEN the request carries a `lang` of `ja` THEN the generated narrative (and
   the deterministic fallback) SHALL be written in Japanese; otherwise it SHALL
   be in English. The default narrative language for a bare API caller is `en`;
   the SPA always sends its current UI language (default UI language `ja`).
3. WHEN the request carries a `model` THEN the backend SHALL validate it against
   the shared allowlist (`resolveModelId`): a known id is used as-is, and an
   unknown/missing id falls back to the default (Nova Lite) WITHOUT a `400`.
4. WHEN the selected model's provider is Amazon Nova THEN the invoker SHALL send
   the Nova request shape (`messages` + `inferenceConfig`) and parse
   `output.message.content[].text`; WHEN it is Anthropic Claude THEN it SHALL
   send the Anthropic messages shape (`anthropic_version` + `content[].text`)
   and parse `content[].text`.
5. IF the Bedrock call fails for any reason (throttling, model access not
   enabled, parse error) THEN the system SHALL return a deterministic templated
   fallback narrative in the requested language and SHALL NOT fail the
   prediction request.
6. WHEN the fallback is used THEN the response `model` field SHALL be suffixed
   with `(fallback)` so the source is transparent; otherwise it SHALL report the
   resolved (allowlisted) model id.
7. WHEN running tests THEN the Bedrock call SHALL be mockable through the
   `BedrockInvoker` interface and SHALL make no live calls.
8. The `lang` and `model` request parameters SHALL be threaded end to end
   (UI -> `api.ts` -> handler lenient parse -> `BracketService.getPrediction`
   -> `resolveModelId` allowlist -> `generateNarrative`), parsed leniently from
   both the GET query and the POST body so a missing/invalid optional NEVER
   causes a `400`.

## Requirement 12 - Finished-game data-integrity warnings

**User story:** As an operator, I want to be told when a finished series or
decided game still references an undetermined/TBD/placeholder team, so that I
can spot a data problem without the site breaking for visitors.

The live MLB Stats API 2026 feed can carry PLACEHOLDER team ids (e.g. "AL Higher
Seed") that are absent from the `TEAMS` map. A placeholder is normal and
expected in a not-yet-started (scheduled) part of the bracket; it is a
data-integrity problem ONLY when it appears in a context that is already
FINISHED, because a completed matchup should reference the two real teams that
played it. The check is pure (`shared/src/integrity.ts`,
`findIntegrityWarnings`) and the handler attaches its result; the aggregator
stays side-effect free.

### Acceptance criteria

1. WHEN a `GET /bracket` response is produced THEN the system SHALL scan it for
   finished contexts (a `final` series, or a decided game) that reference a
   placeholder/TBD team id absent from `TEAMS` and SHALL attach any findings as
   a non-blocking `integrityWarnings` array on the HTTP 200 bracket response.
2. WHEN there are no such findings THEN `integrityWarnings` SHALL be an empty
   array and the response SHALL be unchanged in every other respect.
3. WHEN one or more warnings are found THEN the handler SHALL also log a
   server-side `console.warn` (observable in the Lambda logs) summarizing the
   affected series ids, WITHOUT changing the 200 status.
4. WHEN the SPA receives a bracket carrying a non-empty `integrityWarnings` THEN
   it SHALL show a non-blocking, localized (EN/JA) banner and SHALL still render
   the bracket normally; a clean bracket SHALL show no banner.

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

## Requirement 13 - Regular-season win pct feeds the prediction (standings)

**User story:** As a fan, I want the prediction to reflect how good each team was
during the regular season, so that the favorite and probability are grounded in
real results and the basis is explainable rather than opaque.

The prediction model already blends a per-team strength signal (`winPct`) with
series progress, but that signal was neutral (every team at 0.5) because nothing
supplied it. GitHub Issue #15 closes that wiring gap: the backend now fetches the
real regular-season standings from the MLB Stats API, aggregates them into a
per-team win-pct map with a PURE function, caches that map per season in
DynamoDB (`pk = STANDINGS#<season>`, the same TTL as the bracket cache, no infra
change because the table is single-partition-key), feeds it into `predict()`, and
surfaces the metrics it used on the `mode: 'prediction'` response so the UI can
explain the basis. Only the regular-season win-pct signal is wired; no
Pythagorean (run-differential) or last-10 signal is implemented.

### Acceptance criteria

1. WHEN a numeric prediction is computed for a started current-season series THEN
   the system SHALL resolve a regular-season win-pct map for that season and pass
   it into `predict()`, so the strength signal reflects real standings rather
   than a flat 0.5.
2. WHEN the win-pct map is resolved THEN the resolution order SHALL be: an
   injected non-empty map (test seam) first, else a DynamoDB cache hit
   (`STANDINGS#<season>`), else a live standings fetch that is aggregated and
   written back to the cache.
3. IF the standings fetch, parse, or aggregation fails for ANY reason (network,
   non-200, malformed/early-season JSON) THEN the system SHALL fall back to a
   neutral map (every team treated as 0.5) and SHALL STILL return a
   `mode: 'prediction'` response; it SHALL NEVER throw or turn a prediction into
   an error (Issue #15 acceptance criterion 1).
4. WHEN the standings JSON is aggregated THEN the aggregation
   (`winPctFromStandings`) SHALL be a PURE, side-effect-free function that parses
   each `teamRecords[].winningPercentage` string (e.g. `.580` or `0.580`) into a
   finite number in `[0, 1]`, skips entries with a missing team id or an
   unparseable value, and returns `{}` for an empty/early-season response, so it
   is unit-testable with the MLB API mocked (Issue #15 acceptance criterion 2).
5. WHEN a `mode: 'prediction'` response is produced THEN it SHALL carry an
   additive `metrics` object `{ favorite: TeamMetric, underdog: TeamMetric }`
   where `TeamMetric = { teamId, winPct: number | null }` (`null` means the
   neutral fallback was used for that team), and the `results`/`upcoming`
   variants and existing `Prediction` fields SHALL be unchanged (backward
   compatible).
6. WHEN the prediction panel shows a numeric prediction THEN it SHALL display the
   metrics used (each team's regular-season win pct, or a localized "not
   available" when the value is `null`) so the basis is explainable, localized in
   both EN and JA (Issue #15 acceptance criterion 3).

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

## Requirement 14 - Auto-refresh an in-progress bracket (last updated + manual refresh)

**User story:** As a fan following a live postseason, I want the bracket to keep
itself up to date while a series is in progress, to see when it was last updated,
and to be able to refresh it myself, so that I am not stuck reading stale scores
and I do not have to reload the whole page.

GitHub Issue #17. The behavior is a FRONTEND-ONLY UX change confined to the
`@mlb/frontend` workspace. It polls ONLY for the current, in-progress season,
shows a localized relative-time "last updated" line, offers a manual refresh
button, pauses while the tab is hidden, keeps refreshes flicker-free, and
handles a failed refresh without destroying the data already on screen. The
implementation lives in `frontend/src/relativeTime.ts` (pure localized
relative-time formatter), `frontend/src/useAutoRefresh.ts` (the polling hook and
the `AUTO_REFRESH_INTERVAL_MS` constant), and `frontend/src/pages/HomePage.tsx`
(state wiring and rendering).

### Acceptance criteria

1. WHEN the selected season is predictable (`isPredictable(season)`, i.e.
   `season === CURRENT_YEAR`) AND the loaded bracket currently has at least one
   `in_progress` series THEN the system SHALL poll `getBracket(season)` in the
   background on a fixed interval; WHEN either condition is false (a
   results-only season such as 2024/2025, or a predictable season whose series
   are all `scheduled`/`final`) THEN the system SHALL NOT start the polling
   interval.
2. WHEN polling is enabled THEN the interval SHALL be the documented named
   constant `AUTO_REFRESH_INTERVAL_MS = 60000` (60s), chosen to keep an
   in-progress series reasonably current while staying well under the backend's
   ~15 minute bracket cache TTL so polling never out-paces the data that can
   actually change.
3. WHEN the tab becomes hidden (`document.hidden` via the Page Visibility API)
   THEN the system SHALL pause polling, and WHEN it becomes visible again THEN
   the system SHALL fire an immediate refetch and resume the interval.
4. WHEN a bracket is loaded and started THEN the system SHALL display a
   localized "last updated" line derived from `Bracket.updatedAt`, formatted as
   a relative time (EN "Last updated: {relative}", JA "最終更新: {relative}")
   that advances over time without a manual reload; the relative text SHALL be
   produced by the pure `formatRelativeTime(fromIso, now, lang)` using
   `Intl.RelativeTimeFormat`, clamping a future/zero diff to "now".
5. WHEN a bracket is loaded and started THEN the system SHALL render a manual
   refresh button (EN "Refresh", JA "更新") that triggers an immediate
   background refetch, is disabled and shows an "updating" affordance
   (EN "Updating…", JA "更新中…", `aria-busy`) while the refresh is in flight.
6. WHEN a background refresh (automatic or manual) runs THEN it SHALL be
   flicker-free: it SHALL NOT drop the view back to the full-screen loading
   state (the bracket region stays mounted, so scroll position is preserved) and
   SHALL NOT reset the selected series id.
7. IF a background refresh fails THEN the system SHALL keep the previously
   loaded bracket and surface the error unobtrusively via a small inline notice
   (EN "Could not refresh - showing the last loaded data.", JA
   "更新できませんでした。直前のデータを表示しています。"), NOT the full-screen
   error path; a subsequent successful refresh SHALL clear the notice.
8. WHEN a background refresh resolves AFTER the user has switched seasons THEN
   the system SHALL ignore the stale result (guarded by the requested season),
   so a late refresh never overwrites the newly selected season's bracket.

## Requirement: Model accuracy / backtest (Issue #16)

**User story:** As a visitor who sees an AI win/loss prediction, I want to see
how accurate the underlying prediction model actually was on completed seasons,
with the metrics clearly defined, so that I can judge how much to trust it.

### Acceptance criteria

1. The system SHALL provide a deterministic, seed-only backtest of the
   prediction model over the bundled 2024 and 2025 postseason brackets. The
   backtest SHALL replay each completed series game-by-game ("predict at the end
   of game k" using only the games played so far) and score the model's favorite
   probability against the team that actually won the series. The exact
   `hitRate` and `brierScore` values at a known accuracy SHALL be pinned in unit
   tests so the result is reproducible and cannot silently drift.
2. The system SHALL define the metrics in the UI (localized EN + JA) and in both
   READMEs:
   - **Hit rate** — the fraction of game-by-game snapshots where the favored
     team was the eventual series winner (higher is better; range 0..1).
   - **Brier score** — the mean squared error between the predicted probability
     of the eventual series winner and 1 (range 0..1, lower is better, 0 is
     perfect).
   - **Calibration** — groups predictions into probability buckets and compares
     the mean predicted probability in each bucket to the actual win rate
     observed in that bucket.
3. The system SHALL NOT call Amazon Bedrock (or any network/AWS service) to
   produce the backtest. The engine lives in `@mlb/shared`, imports only pure
   code and the bundled seed JSON, and therefore structurally cannot reach
   Bedrock, DynamoDB, or the network.
4. WHEN the user opens `/accuracy` THEN the system SHALL render a Model accuracy
   page showing hit rate, Brier score, and a calibration display, plus a
   comparison of hit rate and Brier score across the fixed accuracy settings
   `[0, 0.25, 0.5, 0.75, 1]` for the 2024 season, the 2025 season, and the two
   combined. The calibration display SHALL carry accessible text (per-bucket
   `aria-label`s and a caption summary) so it is not purely visual.
5. The system SHALL compute all accuracy metrics CLIENT-SIDE in the SPA by
   importing the shared backtest engine and the bundled seed brackets directly;
   there SHALL be no new backend endpoint and no infrastructure change.
6. The system SHALL expose a visible, localized navigation link to the accuracy
   page from the main UI that is reachable in every season (including the
   results-only 2024/2025 seasons).

## Requirement 15 - Dark mode and accessibility (Issue #22)

**User story:** As a visitor who prefers a dark interface or who navigates by
keyboard or a screen reader, I want a dark theme that follows my OS preference
(and that I can override), legible team-badge text, and a fully keyboard- and
screen-reader-operable bracket, so that the site is comfortable to read and
usable without a mouse.

GitHub Issue #22. This is a FRONTEND-ONLY UX change confined to the
`@mlb/frontend` workspace plus the docs/spec artifacts; there is no backend or
infrastructure change. The theming core is pure and testable
(`frontend/src/theme.ts`: the `ThemePreference`/`ResolvedTheme` types, the
`mlb.theme` localStorage key, guarded `readStoredTheme`/`storeTheme`, the pure
`resolveTheme`, and `getSystemPrefersDark`), the React glue applies it app-wide
(`frontend/src/ThemeContext.tsx` sets `data-theme` on
`document.documentElement`), the header exposes a `ThemeToggle`
(`frontend/src/components/ThemeToggle.tsx`), the badge text color is computed by
the pure `frontend/src/readableTextColor.ts`, the bracket uses a roving-tabindex
keyboard model in `frontend/src/components/BracketView.tsx`, and the automated
accessibility check runs via `@axe-core/playwright` in
`frontend/e2e/a11y.spec.ts`.

### Acceptance criteria

1. WHEN the SPA loads THEN the system SHALL resolve a theme preference of
   `system | light | dark` (default `system`), persisted to `localStorage` under
   the key `mlb.theme`, and SHALL apply the resolved concrete theme
   (`light | dark`) by setting `data-theme` on `document.documentElement` so
   EVERY route (home, series detail, accuracy) inherits it. `localStorage` and
   `matchMedia` access SHALL be guarded so a missing/throwing store or
   environment (SSR/jsdom) does not break rendering.
2. WHEN the preference is `system` THEN the resolved theme SHALL follow the OS
   `prefers-color-scheme` via `matchMedia`, and WHEN the OS preference changes
   live THEN the applied theme SHALL update without a page reload. WHEN the
   preference is `light` or `dark` THEN that explicit choice SHALL win over the
   OS preference.
3. WHEN the user activates the header theme toggle (a `role="group"` of
   System/Light/Dark buttons with `aria-pressed` marking the active choice) THEN
   the system SHALL switch the theme live and persist the new preference to
   `mlb.theme`.
4. WHEN a team badge renders THEN its abbreviation text color SHALL be computed
   from the badge's primary fill by the pure `readableTextColor` helper so the
   text clears WCAG AA contrast on that disc, rather than being a hard-coded
   white.
5. WHEN any themeable surface renders THEN every foreground/background pair
   SHALL clear WCAG AA (>= 4.5:1 for normal text, >= 3:1 for large text and UI
   affordances) in BOTH the light and the dark palette. All themeable colors
   SHALL be CSS custom properties declared on `:root` (light) and overridden
   under `[data-theme="dark"]`; navy used as foreground text on surfaces
   (headings, links, game numbers) SHALL use a dedicated `--heading` variable
   that is brightened in dark mode so it clears AA, distinct from the `--navy`
   fill used for backgrounds/gradients.
6. WHEN a keyboard user reaches the bracket THEN the series cards SHALL use a
   roving-tabindex model (exactly one card tabbable at a time) so Tab enters the
   bracket once and the arrow keys move focus between cards within and across
   round columns; a visible `:focus-visible` ring (theme-aware via
   `--focus-ring`) SHALL show the focused card, and Enter/Space on a finished
   series card SHALL open its detail route.
7. WHEN a screen reader reaches a series card THEN the card SHALL expose an
   accessible label announcing the two teams, the series status, and the score,
   so the bracket is understandable without sight.
8. WHEN the automated accessibility check runs (`@axe-core/playwright`,
   `AxeBuilder` scoped to the WCAG 2.1 A/AA rule tags) over the home bracket, a
   finished-series detail page, and the accuracy page in BOTH the light and the
   dark theme THEN there SHALL be ZERO violations with impact `serious` or
   `critical`. `@axe-core/playwright` SHALL be a `@mlb/frontend` devDependency.
9. WHEN the bracket renders in dark mode THEN the SVG league marks/logos
   (AL/NL/WS, brand, hero, baseball) and the bracket connectors/borders SHALL
   remain legible; the league marks sit on their own colored discs so they
   survive, and any border/connector/focus affordance that would otherwise
   disappear SHALL be driven by a theme-aware CSS variable rather than a
   hard-coded near-white value. The e2e SHALL capture a dark-mode home
   screenshot (into the gitignored `frontend/test-results`) for visual review.

## Requirement 16 - Local-timezone game start times, today/tomorrow, and calendar export (Issue #20)

**User story:** As a fan, I want each game's start time shown in my own
timezone (not shifted to the wrong day), a quick view of what is on today and
tomorrow with a countdown, and a way to add a game to my calendar, so that I
know when to watch without doing timezone math.

GitHub Issue #20. The MLB Stats API returns each game's first pitch as a full
ISO UTC datetime (`gameDate`); the previous aggregation truncated it to a
date-only string, which both lost the time and could display the wrong local
day. This feature preserves the full start time end to end and surfaces it in
the viewer's own timezone.

The preserved start time is an ADDITIVE, backward-compatible change to the
shared contract: `shared/src/types.ts` `GameResult` gains two OPTIONAL fields,
`startTime?: string` (the full ISO UTC datetime copied verbatim from `gameDate`)
and `timeTbd?: boolean`; the pre-existing `date: string` (date-only
`YYYY-MM-DD`) is UNCHANGED so older producers and the bundled seed datasets
(which carry neither new field) keep parsing. The backend derives the fields in
`backend/src/mlb/aggregate.ts`; the display is entirely frontend, computed by
pure, dependency-free helpers (`frontend/src/gameTime.ts`,
`frontend/src/upcomingGames.ts`, `frontend/src/ics.ts`) that take an injected
`now`/`timeZone`/`locale`, and rendered by `SeriesCard.tsx`,
`SeriesDetailPage.tsx`, and a new `UpcomingGames.tsx` mounted on `HomePage.tsx`.
There is NO new backend endpoint and NO infrastructure change: the `.ics` is
generated client-side.

### Acceptance criteria

1. WHEN a game is aggregated THEN the system SHALL preserve its full start time:
   `aggregateBracket` SHALL continue to set `date` as the date-only
   `gameDate.slice(0, 10)` (unchanged, for backward compatibility) AND SHALL
   additionally set `startTime` to the verbatim ISO UTC `gameDate` for a timed
   game, so no time information is lost (Issue #20 criterion 1).
2. WHEN the SPA shows a game's start time THEN it SHALL format the preserved UTC
   instant in the VIEWER's timezone via `Intl.DateTimeFormat`
   (`frontend/src/gameTime.ts` `formatStartTime`), with a localized format per
   UI language - `en-US` 12-hour and `ja-JP` 24-hour, both including the
   weekday/month/day so the local date is unambiguous once converted - so a game
   late in the UTC day is never shown on the wrong local day (Issue #20
   criterion 2). The timezone and locale SHALL be INJECTED into the pure helper
   (the app resolves the browser zone via `resolveTimeZone()`,
   `Intl.DateTimeFormat().resolvedOptions().timeZone`, defaulting to `UTC`) so
   the formatter is deterministic in tests and in the non-Japan sandbox.
3. WHEN a game's start time is undetermined THEN the system SHALL mark it
   `timeTbd` and SHALL omit `startTime`, and the UI SHALL render a localized
   "Time TBD" label (EN `Time TBD`, JA `時刻未定`) instead of a bogus midnight.
   The backend TBD rule SHALL be: `timeTbd` is true WHEN the raw
   `status.startTimeTBD === true` OR the `gameDate` has no meaningful
   time-of-day (an exact midnight-UTC / unparseable placeholder the API uses for
   not-yet-scheduled games); otherwise `timeTbd` is false and `startTime` is set
   (Issue #20 criterion 3). `backend/src/mlb/client.ts` `RawGame.status`
   accordingly carries an optional `startTimeTBD`.
4. WHEN the home page renders for a bracket that has games today or tomorrow
   THEN the system SHALL show a "Today's and tomorrow's games" section
   (`UpcomingGames.tsx`) listing each such game with its matchup, its localized
   local start time, and a countdown to first pitch (EN
   `Starts in {days}d {hours}h {minutes}m`, JA `あと {days}日 {hours}時間 {minutes}分`,
   clamped to zero for a past/unparseable instant). "Today" and "tomorrow" SHALL
   be decided by the game's LOCAL calendar day in the viewer's timezone
   (`frontend/src/upcomingGames.ts` `bucketGameDay`/`selectUpcomingGames`), and
   time-TBD games (no concrete instant) SHALL be skipped. WHEN there are no such
   games (a results-only season, an all-finished bracket, or only TBD games)
   THEN the section SHALL render nothing.
5. WHEN a game has a concrete start time THEN the system SHALL offer an "Add to
   calendar" affordance (EN `Add to calendar`, JA `カレンダーに追加`) that
   downloads a client-side-generated `.ics` file for that game; for a time-TBD
   game the affordance SHALL be omitted. The `.ics` SHALL be built by the pure
   `frontend/src/ics.ts` `buildIcs` (a deterministic single-VEVENT VCALENDAR
   with UTC `DTSTART`/`DTEND`, RFC5545 text escaping, and a default 180-minute
   duration) and delivered via an in-browser Blob download, with NO network
   request, NO new backend endpoint, and NO infrastructure change.
