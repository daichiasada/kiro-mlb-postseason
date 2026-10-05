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

## Requirement 17 - Favorite teams: registration, highlight, header pin, and filter (Issue #18)

**User story:** As a fan who follows one or more teams, I want to mark them as
favorites, see their series stand out in the bracket, get an at-a-glance status
of each favorite in the header, and optionally hide every other team's series,
so that I can track just my teams without hunting through the whole bracket.

GitHub Issue #18. This is a FRONTEND-ONLY UX change confined to the
`@mlb/frontend` workspace plus the docs/spec artifacts; there is no backend or
infrastructure change. It follows the established "persisted localized control"
precedent (i18n language `mlb.lang`, theme `mlb.theme`): a PURE, guarded
localStorage store (`frontend/src/favorites.ts`, key `mlb.favorites`, a JSON
array of team ids), a React glue (`frontend/src/FavoritesContext.tsx`
`FavoritesProvider` + `useFavorites()`) mounted in `main.tsx`, PURE bracket
helpers (`findTeamSeries`/`isTeamEliminated`/`favoriteSummary` in
`frontend/src/bracketLayout.ts`), an accessible star toggle
(`frontend/src/components/FavoriteToggle.tsx`), a non-color-only series
highlight on `SeriesCard`, a header pin (`frontend/src/components/FavoritesPin.tsx`),
and a favorites-only filter on `HomePage`/`BracketView`. All new strings are
EN/JA. Multiple favorites are allowed.

### Acceptance criteria

1. WHEN the SPA loads THEN the system SHALL hydrate the set of favorite team ids
   from `localStorage` under the key `mlb.favorites` (a JSON array of team ids,
   MULTIPLE allowed), and WHEN the stored value is missing, not an array, or
   contains corrupt entries (non-integer, duplicate) THEN the guarded parse
   SHALL drop the bad entries and NEVER throw, returning a clean de-duplicated
   integer array. WHEN the user favorites or unfavorites a team THEN the change
   SHALL be persisted back to `mlb.favorites` so it survives a reload; all
   `localStorage` access SHALL be guarded so a missing/throwing store does not
   break rendering.
2. WHEN a team row renders on a `SeriesCard` or in the `StandingsPanel` THEN the
   system SHALL show a keyboard-accessible star toggle (a native `<button>`)
   whose state is carried by a NON-color cue (a filled star icon when favorited
   vs an OUTLINE star icon when not, i.e. a shape difference), with
   `aria-pressed` reflecting the favorited state and a localized `aria-label`
   (EN `Add {team} to favorites` / `Remove {team} from favorites`, JA
   `{team}をお気に入りに追加` / `{team}をお気に入りから外す`).
3. WHEN a series includes at least one favorite team THEN the system SHALL
   highlight that series WITHOUT relying on color alone (Issue #18 criterion 1):
   it SHALL add a distinct BORDER/OUTLINE treatment (a thick dashed outline that
   is perceivable in grayscale), render a star ICON marker in the card header,
   AND expose a visually-hidden/aria label announcing it is a favorite team's
   series (EN `Favorite team's series`, JA `お気に入りチームのシリーズ`), so the
   cue is perceivable without color and the AA contrast of both the light and
   the dark theme is preserved.
4. WHEN a favorite team has been eliminated (it lost a `final` series,
   `isTeamEliminated`) THEN the system SHALL switch that team from an active
   status to a localized `Eliminated` / `敗退` indication (Issue #18
   criterion 2) in BOTH the header pin and the bracket highlight, rather than
   showing a leading/trailing record for it.
5. WHEN there is at least one favorite in the selected season's bracket THEN the
   system SHALL render a header pin region (labeled `favorites.header.title`, EN
   `Your teams`, JA `あなたのチーム`) showing each in-bracket favorite's
   current/next series status: eliminated (`敗退`), champion (`優勝`), an
   in-progress leading/trailing/tied `{wins}-{losses}` record, or the next
   scheduled game's local start time (reusing `frontend/src/gameTime.ts`
   `formatStartTime`/`resolveTimeZone`). WHEN there are no favorites, OR none of
   the favorites appears in the selected season's bracket (`inBracket === false`),
   THEN the pin SHALL render NOTHING (no empty box); an unknown favorite id
   SHALL NOT throw (it resolves to a localized placeholder name).
6. WHEN the user turns on the localized favorites filter toggle
   (`favorites.filter.label`, EN `Show only my teams`, JA
   `お気に入りのチームだけ表示`, an `aria-pressed` button) THEN the bracket SHALL
   show ONLY series that include at least one favorite team; WHEN the filter is
   ON and no favorite has a series in the current bracket THEN the system SHALL
   render a friendly localized empty state (`favorites.filter.empty`, EN
   `None of your favorite teams have a series in this bracket.`, JA
   `お気に入りのチームのシリーズはこのトーナメント表にありません。`) INSTEAD of
   an empty grid. The filter SHALL coexist with the season selector: switching
   seasons SHALL keep the toggle state, and the empty state SHALL appear if the
   newly selected season has no favorite series.
7. WHEN the favorites filter is applied to the bracket THEN the roving-tabindex
   keyboard model from Issue #22 SHALL remain intact (the active-cell clamp
   already handles a shrunken grid, mirroring a season switch), and the Issue
   #22 SeriesCard keyboard model and the Issue #17 refresh bar / Issue #20
   UpcomingGames UI SHALL be unregressed.
8. WHEN any favorites UI string is shown THEN it SHALL exist in BOTH the EN and
   JA message tables (Issue #18 criterion 3).

## Requirement 18 - Series-flow visualization (charts + sparkline) (Issue #24)

**User story:** As a fan reviewing a postseason series, I want to see how the
series flowed game by game (run margins, who was pulling ahead, and - for the
current predictable season - the model's shifting win probability) as compact,
accessible charts, so I can read the arc of the series at a glance without
parsing a raw box-score list, and so a quick sparkline on each bracket card
summarizes the series on the home page.

This feature is FRONTEND-ONLY. It reuses the pure shared `predict()` (via the
shared `seriesProbTrend` per-game truncation) for the probability overlay and
never makes a Bedrock or live MLB call. It works for the bundled seed / past
seasons (2024, 2025) WITHOUT a prediction overlay, since those seasons are not
predictable.

### Acceptance criteria

1. WHEN a series with at least one game is shown on its detail page THEN the
   system SHALL render a per-game run-DIFFERENCE bar chart and a cumulative
   series-win trend chart as inline SVG, fed by the pure helpers
   `seriesScoreDiffs` and `cumulativeWinTrend`, with bars/lines colored by the
   relevant team's brand color via `teamColor()`.
2. WHEN the selected season is the predictable current season AND the series has
   games THEN the system SHALL ALSO render a per-game predicted
   favorite-win-probability trend chart, computed via `winProbTrend` which
   delegates to the shared `seriesProbTrend` (predict + the single-source
   per-game truncation); WHEN the season is results-only (seed/past) THEN the
   probability chart SHALL be ABSENT.
3. WHEN any chart renders THEN it SHALL be an accessible SVG (`role="img"` with
   an accessible name via `aria-labelledby`) AND SHALL be paired with a real
   tabular `<table>` alternative (wired via `aria-describedby`, collapsed behind
   a localized show/hide data-table toggle) conveying the SAME data in TEXT,
   with the winner conveyed as TEXT (`{team} won` / `Tie` / `In progress`), not
   color alone.
4. WHEN charts render THEN axes, gridlines, tick labels, and frames SHALL use
   theme CSS variables so they are legible in BOTH the light and the dark theme,
   and any text drawn on a team-color fill SHALL pick its foreground via
   `readableTextColor()`.
5. WHEN a `SeriesCard` with at least one game renders on the bracket THEN the
   system SHALL show a subtle, theme-aware inline-SVG score-DIFFERENCE sparkline
   (reusing `seriesScoreDiffs`) with a localized `aria-label` on a single
   `role="img"` element whose children are `aria-hidden`; cards WITHOUT games
   SHALL show NO sparkline.
6. WHEN the sparkline is present THEN it SHALL add NO focusable element (no
   `tabindex`, no interactive node) so the Issue #22 roving-tabindex keyboard
   model and Enter/Space activation are unchanged, SHALL NOT regress the Issue
   #18 favorite highlight, and SHALL NOT cause horizontal overflow at a 375px
   mobile width (width is constrained to the card content width).
7. WHEN any series-flow string is shown THEN it SHALL exist in BOTH the EN and
   JA message tables (default JA).

## Requirement 19 - Per-game detail: line score, pitchers, venue, highlights (Issue #19)

**User story:** As a fan reviewing a series, I want to open a single game and
see its inning-by-inning line score (R/H/E), the winning/losing/save pitchers,
the venue, and a recap/highlights link when one exists, so that I can study how
a game played out without leaving the series detail page.

GitHub Issue #19. The series detail page gains a per-game ACCORDION: expanding a
game lazily fetches its detail from a NEW backend endpoint `GET /game?gamePk=`,
which returns a `GameDetailResponse` discriminated union. The backend assembles
the detail from the MLB Stats API linescore (per-inning + totals R/H/E) and
feed/live (venue, game state, W/L/S pitcher decisions), plus an OPTIONAL
best-effort content/recap link, using PURE parsers in
`backend/src/mlb/gameDetail.ts`. Each game's detail is cached in DynamoDB under
`pk = GAME#<gamePk>` with a TTL chosen by game state (a completed game is cached
long; an in-progress game short). A new `GetGameDetailFn` Lambda (TABLE_NAME env
only, NO Bedrock) backs the `GET /game` route, so the API now exposes three app
Lambdas and routes (`GET /bracket`, `GET`/`POST /prediction`, `GET /game`).

### Acceptance criteria

1. WHEN a game's detail is requested THEN the system SHALL first read the
   DynamoDB cache keyed by `pk = GAME#<gamePk>` and return a cache hit WITHOUT
   refetching; on a miss it SHALL fetch, assemble, and write the detail back
   with a TTL chosen by game state - a COMPLETED game (MLB `abstractGameState`
   `Final`/`Game Over`/`Completed Early`) uses the LONG TTL
   (`GAME_DETAIL_FINAL_TTL_SECONDS = 604800`, one week) and anything else uses
   the SHORT live TTL (`GAME_DETAIL_LIVE_TTL_SECONDS = 60`, one minute), so a
   finished game is cached long and never needlessly refetched (Issue #19
   criterion 1).
2. WHEN the upstream MLB linescore/feed-live fetch fails for ANY reason THEN the
   system SHALL return the documented `{ status: 'unavailable', gamePk }`
   fallback at HTTP 200 WITHOUT throwing and WITHOUT caching it, so the frontend
   keeps showing the already-known final score instead of surfacing an error
   (Issue #19 criterion 2).
3. WHEN a game detail is served `ok` THEN it SHALL carry the inning-by-inning
   line score and the game totals (per side `runs`/`hits`/`errors`, each `null`
   when the MLB API omits it), the winning/losing/save pitcher decisions
   (`pitchers.winner`/`loser`/`save`, each omitted when absent), the game state,
   the venue when available, and an OPTIONAL recap `highlight` (`{ title, url }`)
   that is included only when the best-effort content fetch yields a link; a
   content fetch/parse failure SHALL NEVER fail the overall call.
4. WHEN the detail is parsed THEN the parsing SHALL be done by PURE,
   side-effect-free functions in `backend/src/mlb/gameDetail.ts`
   (`parseLinescore`, `parseGameMeta`, `parseHighlight`, `buildGameDetail`) that
   tolerate missing fields and perform NO network or AWS access, so they are
   unit-testable with the MLB API mocked.
5. IF the `gamePk` query is missing or is not a positive integer THEN the
   `GET /game` endpoint SHALL respond `400`; a parse/assembly it cannot recover
   from SHALL respond `500`.
6. WHEN a game is shown on the series detail page THEN the system SHALL render a
   per-game accordion toggle (`aria-expanded`/`aria-controls`) that LAZILY
   fetches `GET /game` only on first expand, renders the inning R/H/E table, the
   W/L/S pitchers, the venue, and the optional highlights link, and on a fetch
   failure or an `unavailable` response SHALL keep the existing final score
   visible rather than erroring.
7. WHEN the inning line-score table is shown on a narrow (mobile) viewport THEN
   it SHALL sit inside a horizontally-scrollable container
   (`.detail__linescore-scroll`) so the table scrolls on its own without
   breaking the page-level 375px no-horizontal-overflow guarantee (Issue #19
   criterion 3).
8. WHEN any game-detail UI string is shown THEN it SHALL exist in BOTH the EN
   and JA message tables (default JA).
9. WHEN the stack is synthesized THEN the game-detail Lambda (`GetGameDetailFn`,
   Node 20) SHALL carry ONLY the `TABLE_NAME` environment variable (NO
   `BEDROCK_MODEL_ID`), SHALL be granted DynamoDB read/write but NO
   `bedrock:InvokeModel` IAM, and SHALL be wired to a `GET /game` HTTP API route,
   so the API exposes exactly three app Lambdas and three route paths.

## Requirement 20 - Prediction cache and Bedrock cost control (Issue #23)

**User story:** As an operator, I want repeat prediction requests for the same
series situation to reuse a cached result instead of calling Amazon Bedrock
again, the public no-auth endpoint's request rate to be bounded, and cache / cost
metrics to be visible, so that the billable Bedrock path cannot be driven into
runaway cost and I can observe how often the cache saves a call.

GitHub Issue #23. `/prediction` is a public endpoint whose only billable branch
invokes Bedrock. The backend now caches a produced `mode: 'prediction'` response
in DynamoDB keyed by the series situation and the narrative knobs, serves a
repeat same-situation request from the cache WITHOUT calling Bedrock, and emits
cache / Bedrock metrics via CloudWatch Embedded Metric Format (EMF) log lines so
no `cloudwatch:PutMetricData` IAM or extra AWS SDK call is added. The HTTP API
default stage is throttled to bound the request rate. The cache key is a pure
tested function (`backend/src/service/predictionCacheKey.ts`), the cache storage
lives on the existing single-`pk` table (`backend/src/store/dynamo.ts`), the
cache-first wiring is in `backend/src/service/bracketService.ts`, the EMF helper
is `backend/src/metrics/emf.ts`, and the throttling is in
`infra/lib/mlb-postseason-stack.ts`.

### Acceptance criteria

1. WHEN a `mode: 'prediction'` response is produced THEN the system SHALL cache
   it in DynamoDB under the partition key
   `PREDICTION#<seriesId>#<highWins>-<lowWins>#<language>#<modelId>#<accuracy>`,
   where an undefined `accuracy` is resolved to the model default
   (`DEFAULT_ACCURACY = 0.5`) BEFORE the key is built so the same logical
   situation maps to one stable key. Only `mode: 'prediction'` responses SHALL
   be cached; the results-only / final / not-started short-circuits SHALL NOT be
   cached. The cache SHALL be a no-op when `TABLE_NAME` is unset.
2. WHEN a second prediction request arrives for the same situation (same series
   id, win counts, language, model, and accuracy) THEN the system SHALL return
   the cached `PredictionResponse` from the cache lookup WITHOUT running
   `predict()` or `generateNarrative()` / Bedrock (Issue #23 acceptance
   criterion 1). The cache lookup SHALL sit AFTER the three Bedrock-free
   short-circuits (results-only season, `final` series, unresolvable /
   not-started series).
3. WHEN a game result changes a series' win counts (`high.wins` / `low.wins`)
   THEN the request SHALL map to a DIFFERENT cache key, which effectively
   invalidates the cache and produces a fresh prediction and a new Bedrock call
   (Issue #23 acceptance criterion 2). A numeric `ttl` of 15 minutes
   (`PREDICTION_TTL_SECONDS`) SHALL be written as a backstop only; the
   win-count-in-key design SHALL be the primary invalidation mechanism.
4. WHEN the stack is synthesized THEN the HTTP API implicit `$default` stage
   SHALL carry `DefaultRouteSettings` with `ThrottlingRateLimit = 20`
   (requests/second steady state) and `ThrottlingBurstLimit = 40`, bounding the
   public no-auth `/prediction` endpoint's Bedrock cost, and
   `infra/test/stack.test.ts` SHALL assert these exact values (Issue #23
   acceptance criterion 3). CORS and the existing routes (`GET /bracket`,
   `GET`/`POST /prediction`, `GET /game`) SHALL be unchanged.
5. WHEN a prediction request is served THEN the system SHALL emit CloudWatch
   metrics via Embedded Metric Format (EMF) stdout log lines (NO
   `cloudwatch:PutMetricData` IAM, NO extra AWS SDK call) in the namespace
   `MlbPostseason/Prediction` with the metric names `PredictionCacheHit`,
   `PredictionCacheMiss`, and `BedrockInvokeCount` (value `0` on a cache hit, `1`
   on a miss). The emission SHALL carry NO high-cardinality dimension; the series
   id SHALL be a plain log property, not a dimension.

## Requirement 21 - Shareable per-series OGP image and crawler HTML (Issue #21)

**User story:** As a fan, I want to share a link to a specific series that shows
a rich social preview (the matchup, the current score, and the model's favorite)
so that the card is informative when posted to social media, while the shared
link still opens the live SPA for a human visitor.

GitHub Issue #21. Pure, tested builders in `@mlb/shared` (team brand colors, the
localized share disclaimer, `buildOgImageSvg`, `buildShareHtml`, and the
permalink/share-URL builders) are reused by two new no-Bedrock Lambdas:
`GET /og` returns a deterministic 1200x630 OGP image as `image/svg+xml`, and
`GET /share` returns crawler-readable HTML carrying the per-series
OpenGraph/Twitter meta tags and a redirect into the SPA. Generated bytes are
cached in DynamoDB on the existing single-`pk` table, and CloudFront routes the
dedicated `/og` and `/share` paths to the HTTP API so a social crawler fetching a
share link on the site origin reaches the Lambda-rendered meta tags rather than
the SPA shell. For a human, the SPA renders a localized Share button (Web Share
API with a clipboard-copy fallback) that produces a `?lang=`-tagged permalink
and includes the disclaimer in the shared text. A deliberate trade-off: the OGP
image is an SVG (no native rasterizer dependency such as `sharp`), and some
crawlers do not render an SVG `og:image`.

This requirement maps Issue #21's three acceptance criteria: (1) the OGP image
generation method is decided and implemented (deterministic SVG via `GET /og`,
cached) - criteria 1 below; (2) a crawler can read the per-series OGP meta tags
even though the frontend is a SPA (`GET /share` HTML behind a dedicated
CloudFront path, redirecting a human into the SPA) - criteria 2 and 4 below; and
(3) the disclaimer ("predictions are reference values, not betting advice") is
included in every shared artifact (the OG image footer, the `og:description`,
and the human Share text) - criteria 1, 2, and 5 below.

### Acceptance criteria

1. WHEN `GET /og?season=&seriesId=&lang=` is called with a resolvable series
   THEN the system SHALL return HTTP 200 `image/svg+xml` generated by the shared
   `buildOgImageSvg`, cache-first in DynamoDB keyed by
   `OG#<seriesId>#<highWins>-<lowWins>#<lang>`: a cache HIT SHALL return the
   stored SVG WITHOUT rebuilding, and a MISS SHALL build it, store it (under an
   `svg` attribute with a numeric `ttl`, `OG_IMAGE_TTL_SECONDS` = 15 min), and
   return it. The SVG body SHALL contain the localized `SHARE_DISCLAIMER`. A
   missing/blank `seriesId` SHALL return HTTP 400 and an unknown series HTTP 404
   (JSON). The cache SHALL be a no-op when `TABLE_NAME` is unset.
2. WHEN `GET /share?season=&seriesId=&lang=` is called with a resolvable series
   THEN the system SHALL return HTTP 200 `text/html` from the shared
   `buildShareHtml` carrying per-series `og:title`, `og:description` (INCLUDING
   the localized disclaimer), `og:image`, `og:url`, and `twitter:*` tags, plus
   both a `<meta http-equiv="refresh">` and an inline `location.replace(...)`
   that redirect a human visitor into the SPA deep link. The HTML SHALL be
   cached under `SHARE#<seriesId>#<highWins>-<lowWins>#<lang>` (reusing the same
   store getter/putter as `/og`). A missing `seriesId` SHALL return HTTP 400 and
   an unknown series HTTP 404. The absolute canonical / OG-image / SPA URLs SHALL
   use a public origin derived from the forwarded request headers
   (`X-Forwarded-Proto` + `Host`) with a `SITE_ORIGIN` env override and a
   localhost fallback.
3. The two new Lambdas (`GetOgImageFn`, `GetShareHtmlFn`) SHALL carry ONLY the
   `TABLE_NAME` environment variable (NO `BEDROCK_MODEL_ID`) and SHALL be granted
   DynamoDB read/write but NO `bedrock:InvokeModel` policy.
4. WHEN the stack is synthesized THEN CloudFront SHALL route the dedicated path
   patterns `/og`, `/og/*`, `/share`, and `/share/*` to the HTTP API via an
   `HttpOrigin` (query-string-keyed cache policy, redirect-to-https), with no
   User-Agent sniffing, while the default SPA behavior and the 403/404 ->
   `/index.html` error responses stay unchanged. `infra/test/stack.test.ts` SHALL
   assert FIVE Node 20 app Lambdas, EXACTLY ONE `bedrock:InvokeModel` policy
   (still only `GetPredictionFn`), the `GET /og` and `GET /share` routes, and the
   CloudFront behaviors/origin for the share/OG paths.
5. WHEN a human views a series THEN the SPA SHALL offer a localized Share
   control that builds the canonical series permalink from the live page origin
   and the active UI language via the shared `buildSeriesPermalink` (so the URL
   carries `?lang=en|ja`), and SHALL first try the Web Share API
   (`navigator.share`), fall back to copying the link to the clipboard
   (`navigator.clipboard.writeText`, with a localized "Link copied"
   confirmation), and if neither is available surface the URL in a read-only
   input for manual copy; every browser API SHALL be feature-detected so the
   control is inert and safe under jsdom. The shared text SHALL include the
   localized `SHARE_DISCLAIMER` so a shared prediction is never presented as
   betting advice.
6. WHEN the SPA loads a URL carrying a valid `?lang=` query (a shared permalink)
   THEN it SHALL open in that language, taking precedence over the persisted
   value, and SHALL persist the choice so later in-app navigation (which drops
   the query) keeps the shared language; an invalid/absent `lang` SHALL fall
   back to the persisted value or the default (`ja`).
