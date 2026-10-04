# Design - MLB Postseason Summary Site

Spec-driven development artifact. This describes the architecture and the data
flow of the system as it is actually implemented in this repository.

## Architecture overview

```
Browser
  |
  v
CloudFront (HTTPS)  --->  S3 (private, OAC)  [static React/Vite SPA bundle]
  |   /config.js injects window.__API_BASE_URL__
  v
API Gateway (HTTP API, CORS)
  |-- GET  /bracket      -> Lambda getBracket   (Node 20)
  |-- GET/POST /prediction -> Lambda getPrediction (Node 20)
          |
          v
   BracketService  --->  DynamoDB cache (pk BRACKET#<season>, ttl)
          |          --->  MLB Stats API (statsapi.mlb.com)
          |          --->  Amazon Bedrock (selectable Amazon Nova / Anthropic Claude)
          |          --->  bundled 2024 + 2025 seeds (shared/src/seed)
```

All components are TypeScript. The backend collaborators are injectable so the
service is unit-testable with no network or AWS access.

## Season configuration (single source of truth)

`shared/src/season.ts` (exported from `@mlb/shared`) is the single source of
truth for the app's notion of "now", so backend and frontend always agree and no
`2026` literal is scattered across the codebase:

- `CURRENT_YEAR = 2026` - the app's current year ("now").
- `SELECTABLE_SEASONS = [2026, 2025, 2024]` - seasons offered in the UI
  selector, newest-first.
- `seasonMode(season): 'results' | 'predictable'` - the pure classifier. A
  season strictly before `CURRENT_YEAR` is `'results'` (completed, results-only);
  `season === CURRENT_YEAR` is `'predictable'` (in-progress, prediction enabled).
  `isResultsOnly(season)` and `isPredictable(season)` are convenience wrappers.

Both default-season constants derive from `CURRENT_YEAR`:
`backend/src/handlers/http.ts` `DEFAULT_SEASON` and `frontend/src/config.ts`
`DEFAULT_SEASON`. To advance the app to a new year, change `CURRENT_YEAR` (and
extend `SELECTABLE_SEASONS`) in that one module.

## Prediction response contract (PredictionResponse)

`shared/src/types.ts` defines `PredictionResponse` as a discriminated union, and
the `/prediction` endpoint returns it with **HTTP 200 for all three variants** so
the frontend can branch on `mode`:

- `(Prediction & { mode: 'prediction' })` - a full numeric prediction (favorite,
  `favoriteWinProbability`, Bedrock `narrative`, `model`, `generatedAt`) for a
  resolvable, started series in the current (predictable) season.
- `ResultsOnlyPrediction` = `{ mode: 'results', seriesId, season, message }` -
  returned for a results-only season (`season < CURRENT_YEAR`). The service
  short-circuits this case BEFORE loading the bracket, running `predict()`, or
  invoking Bedrock.
- `UpcomingPrediction` = `{ mode: 'upcoming', seriesId, season, message }` -
  returned for the current season when the series is unresolvable (empty or
  placeholder-only bracket) or has not started. A series has "not started" when
  it is `scheduled` OR has no decided game (no game with a real winner). The
  live MLB Stats API lists not-yet-played games as "Preview" entries with null
  scores and null winners, so a preview-only series carries games but has
  decided nothing; `aggregateBracket` classifies it as `scheduled`.

## Frontend

- React + Vite single-page app, deployed as a static bundle to a private S3
  bucket fronted by CloudFront with Origin Access Control.
- The API base URL is injected at runtime through a `/config.js` asset
  (`window.__API_BASE_URL__`), so the same bundle works across environments.
- Components: a bracket view (series cards ordered by round), a standings /
  summary panel grouping teams by league, and a prediction panel.
- A labeled season selector (`App.tsx`) renders a button per
  `SELECTABLE_SEASONS`, defaults to `CURRENT_YEAR`, and on change re-fetches the
  bracket and clears the selected series.
- Conditional prediction UI driven by `isPredictable(season)`:
  - Current season (2026, predictable): the interactive `PredictionPanel` is
    shown and each series card exposes a "Predict winner" button.
  - Past seasons (2024, 2025, results-only): the prediction panel and the
    "Predict winner" button are hidden; a "Final results" treatment is shown and
    each series card instead exposes a non-interactive "View details"
    affordance so game-by-game detail still works.
  - Current season with no started content (empty / placeholder-only bracket, or
    only not-yet-started series - including preview-only series that carry games
    but have decided no winner): a "The YYYY postseason has not started yet"
    message is shown instead of a broken bracket. `hasStartedContent` keys on a
    decided game (or a recorded win), not merely on `games.length > 0`, so it
    agrees with the aggregator and backend `upcoming` guard on the real
    preview-game shape.
- Playwright e2e specs in `frontend/e2e/` drive these flows.

### Client-side routing (history / path-based)

The SPA uses `react-router-dom` v6 `BrowserRouter` (pinned to `^6` for React 18
compatibility). `main.tsx` wraps `<App/>` in `<BrowserRouter>` and the i18n
provider; `App.tsx` is just the `<Routes>` table:

- `/` -> `<Navigate replace>` to `/season/{DEFAULT_SEASON}` (= `CURRENT_YEAR`,
  2026).
- `/season/:season` -> `HomePage` (`frontend/src/pages/HomePage.tsx`), the
  bracket + standings + prediction panel; the season is read from the route
  param via `frontend/src/seasonRoute.ts` `parseSeasonParam` (which falls back
  to the default for a missing/unknown/non-selectable value).
- `/season/:season/series/:seriesId` -> `SeriesDetailPage`
  (`frontend/src/pages/SeriesDetailPage.tsx`).
- `*` -> redirect to the default season.

Path-based (history) routing is chosen over hash routing because it produces
clean, shareable deep links, and it is compatible with the deployment: the
CloudFront distribution already rewrites `403`/`404` responses to `/index.html`
with `responseHttpStatus: 200` (`infra/lib/mlb-postseason-stack.ts`
`errorResponses`), so a deep link like `/season/2026/series/<id>` served by S3
(which has no such object) falls back to the SPA shell, which then renders the
correct route. No infra change was needed for routing. The Vite `preview` server
used by the e2e suite performs the same SPA fallback, so deep-link navigation is
exercised in CI too.

### Finished-series detail page

`SeriesDetailPage` re-fetches the bracket for the route's season (reusing
`getBracket` with its offline-seed fallback), finds the series by id, and renders
its teams, per-game scores, winner, and series result, plus a localized back
link to `/season/{season}`. An unknown series id renders a friendly "Series not
found" region (`role="region"`) with a return link instead of erroring.

### Collapsible game detail + layout fix

The root cause of the uneven ("gatagata") bracket was that each `SeriesCard`
always rendered its full inline game-by-game `<ol>`, giving cards wildly
different heights. The fix:

- The game list is now wrapped in a per-series toggle (`SeriesCard.tsx`): a
  button with `aria-expanded` and `aria-controls` (the controlled `<ol>` id has
  React `useId()` colons stripped so it is valid in CSS/Playwright selectors),
  COLLAPSED by default via the HTML `hidden` attribute. Collapsing it by default
  equalizes card heights.
- `styles.css` top-aligns the grid columns (`.bracket__grid { align-items:
  start }`), pins the single trailing action to the bottom (`margin-top: auto`)
  so headers/teams/meta line up across cards and columns, and keeps the 860px
  (2-col) and 560px (1-col) media queries plus the no-horizontal-overflow
  guarantee intact.

### Finished-series: prediction OFF at the frontend

Consistent with the backend series-level gating (step 4 of `getPrediction`), a
finished (`status === 'final'`) series card does NOT render the interactive
"Predict winner" button even in the predictable 2026 season (the predict button
renders only when `onSelect && predictable && !isFinal`); it surfaces the
detail-page link instead. Because a final series is never selected for
prediction, the `PredictionPanel` never requests or shows a numeric probability
for it, and the detail page shows the final result rather than a prediction. If
a `mode: 'results'` response were ever received, the panel degrades to a
no-numeric message rather than a `progressbar`.

### i18n layer (JA/EN)

A lightweight in-repo React context under `frontend/src/i18n/` provides
localization with NO new runtime dependency:

- `messages.ts` holds `type Lang = 'ja' | 'en'`, the FLAT dotted-key dictionary
  `MESSAGES: Record<Lang, Record<MessageKey, string>>` (TypeScript enforces that
  every key exists in both languages), and `ROUND_KEY`/`STATUS_KEY` maps.
- `index.ts` exposes `I18nProvider`, `useI18n(): { lang, setLang, t }` where
  `t(key, params?)` does dictionary lookup + `{param}` interpolation (missing
  key falls back to the key; missing param leaves the placeholder intact), plus
  helpers `roundName`, `statusLabel`, `teamName`, `teamAbbr`.
- Default language is Japanese (`DEFAULT_LANG = 'ja'`) because the feature
  requests arrived in Japanese; the choice is persisted to
  `localStorage['mlb.lang']` (`LANG_STORAGE_KEY`) and hydrated on load, with all
  `localStorage` access try/catch-guarded for jsdom/SSR safety (an invalid
  stored value is ignored).
- The header `LanguageToggle` is a `role="group"` with two buttons, the active
  language marked by `aria-pressed`.
- Team-name resolution is centralized: known ids render `TEAMS[id].name`
  (English club names in both languages, by design); unknown/preview ids render
  the LOCALIZED placeholder from the `team.unknown` key - EN `TBD (#<id>)`, JA
  `未定 (#<id>)` - so a raw `Team <id>` never leaks, including in the
  game-score abbreviation positions.

### Accuracy control (prediction panel)

The `PredictionPanel` renders an accessible, localized model-accuracy slider
(`<input type="range">`) in `[0, 1]` stepping by `ACCURACY_STEP = 0.05`,
defaulting to `DEFAULT_ACCURACY = 0.5` (mirrored from the backend in
`frontend/src/config.ts`) so the initial behavior is unchanged. The slider has a
localized label, a visible current value, an `aria-describedby` help text and an
`aria-valuetext`. Changing it debounces (~300ms, to avoid a request per drag
pixel) and then re-requests `getPrediction(seriesId, season, accuracy)`, which
appends `&accuracy=<encodeURIComponent(value)>` to the query; the displayed
favorite/probability/narrative update while the existing loading/error states are
preserved. The control is shown only while a series is selected and a numeric
prediction is being fetched or displayed (not in the idle/upcoming states).

## API and Lambdas

Two Node 20 Lambdas behind an API Gateway HTTP API with CORS:

- `backend/src/handlers/getBracket.ts` - `GET /bracket?season=YYYY`. Parses and
  validates the season, calls `BracketService.getBracket`, returns the bracket
  JSON or `400`/`500`.
- `backend/src/handlers/getPrediction.ts` - `GET`/`POST /prediction`. Parses
  `seriesId` + `season`, calls `BracketService.getPrediction`, and returns the
  `PredictionResponse` union (`mode: 'prediction' | 'results' | 'upcoming'`)
  with HTTP 200; `400` for a missing `seriesId` or invalid `season`; `500` if
  `getBracket` throws.
- `backend/src/handlers/http.ts` provides `jsonResponse` (with CORS headers),
  `parseSeason`, and `DEFAULT_SEASON` (derived from the shared `CURRENT_YEAR`).

## BracketService resolution order

`backend/src/service/bracketService.ts` orchestrates everything.

### getBracket(season)

1. Read the DynamoDB cache (`store.getCachedBracket`). On a hit, return it.
2. On a miss, `fetchPostseasonSchedule(season)` -> `aggregateBracket(games,
   season)` -> `store.putCachedBracket(bracket)` -> return the fresh bracket.
3. On an MLB fetch error, return `getSeedBracket(season)` when it exists
   (seasons 2024 and 2025), otherwise rethrow (so the current 2026 season with
   no seed produces a `500` when the live fetch fails).

### getPrediction(seriesId, season, accuracy?)

The method returns a `PredictionResponse` discriminated union (see the contract
above). The optional `accuracy` is threaded through to `predict()`; when
undefined the model default (`0.5`) applies:

1. If `isResultsOnly(season)` (season `< CURRENT_YEAR`), short-circuit and
   return `{ mode: 'results', ... }` immediately. This happens BEFORE loading
   the bracket, running `predict()`, or invoking Bedrock, so a results-only
   season never pays for a prediction.
2. Otherwise `getBracket(season)` (same resolution order above).
3. `resolveSeries(bracket, seriesId)`: try an exact id match first; if that
   fails, parse the id and match by round slug plus the *unordered* team-id pair
   (this tolerates a high/low-seed ordering disagreement across the seed/live
   boundary - the ISSUE-1 fix).
4. Finished-series gating (series level). If the resolved series has
   `status === 'final'`, return `{ mode: 'results', ... }` with a
   season-appropriate message WITHOUT calling `predict()` or
   `generateNarrative()`/Bedrock, EVEN in the current predictable season. This
   is the series-level analogue of the season-level results-only short-circuit:
   a completed series shows its final result, never a speculative prediction.
5. If the series is not resolvable OR has not started, return
   `{ mode: 'upcoming', ... }` so an empty/placeholder-only 2026 bracket
   degrades gracefully instead of erroring. "Not started" means the series is
   `scheduled` OR has no decided game (no game with a real winner and no
   recorded win) - this catches the real preview-game shape, where the
   aggregator classifies a games-but-no-results series as `scheduled`.
6. Otherwise `predict(series, bracket, winPct, accuracy)` to compute the
   favorite and probability (honoring the accuracy control), then
   `generateNarrative(series, result, invoker)` for the prose (deterministic
   fallback on any Bedrock error), returning `{ mode: 'prediction', ... }`.

The handler (`getPrediction.ts`) parses `accuracy` from BOTH the GET query
(`?accuracy=`) and the POST body (via `http.ts` `parseAccuracy`, which returns
`undefined` for a missing/non-finite value so the model default applies; a bad
`accuracy` never causes a `400`). It returns all three variants with HTTP 200;
it still responds `400` for a missing `seriesId` or an invalid `season`, and
`500` only if `getBracket` itself throws.

## Aggregation - aggregateBracket

`backend/src/mlb/aggregate.ts` is a pure function:

- Groups raw games by `(seriesDescription + unordered team pair)` so both teams
  map to one series regardless of home/away in a given game.
- Derives `round` from the description (`mapRound`) and `league` (`mapLeague`,
  `AL | NL | WS`).
- The high seed is the home team of game 1 (home-field advantage).
- `bestOf` comes from `gamesInSeries`, defaulting per round (3/5/7).
- Wins are tallied from each game's `isWinner`; `status` is `final` when either
  team reaches the clinch count `ceil(bestOf / 2)`, `scheduled` when there are
  no decided games (either no games at all, or only not-yet-played "Preview"
  games with null scores/winners - the real pre-start 2026 shape), else
  `in_progress`. Keying `scheduled` on "no decided game" rather than "no games"
  is what lets a preview-only series reach the documented upcoming/empty path.
- Series ids are `${season}-${league}-${roundSlug}-${highId}-${lowId}`.
- Placeholder-team tolerance (current season): the live 2026 schedule can
  include placeholder teams for not-yet-determined rounds (e.g. "AL Higher
  Seed", "Higher Seed League Champion"). `aggregateBracket` keys purely on team
  ids and never looks teams up in `TEAMS`, so unknown ids do not throw; the
  frontend renders them via a `Team <id>` fallback name. `mapRound` also falls
  back to Division Series for any unexpected description, so aggregation is
  best-effort and never crashes on data drift.

## Prediction model - predict

`backend/src/predict/model.ts` is a pure, deterministic heuristic:

- Blends a series-progress signal (`wins / clinch`, weight 0.7) with a
  regular-season strength signal (`winPct`, defaulting to neutral 0.5, weight
  0.3), plus a small home-field edge (0.02) to the high seed.
- The favorite is the higher-scoring team; its raw share of the combined score
  is clamped to `[0.5, 0.95]` to produce `p0`.
- Configurable accuracy (sharpness/temperature). `predict(series, bracket,
  winPct, accuracy = DEFAULT_ACCURACY)` takes a 4th positional argument in the
  range `[MIN_ACCURACY, MAX_ACCURACY] = [0, 1]` with `DEFAULT_ACCURACY = 0.5`.
  These bounds (plus the frontend slider `ACCURACY_STEP = 0.05`) are a shared
  domain contract defined once in `@mlb/shared` (`shared/src/accuracy.ts`);
  `model.ts` imports and re-exports them, and the frontend `config.ts` imports
  them, so the model's accepted range and the UI slider cannot drift apart. The
  clamped share `p0` is sharpened around the
  conservative floor by a linear factor `f = 2 * accuracy`:
  `p = 0.5 + (p0 - 0.5) * f`, then clamped again to `[0.5, 0.95]` and rounded to
  4 decimals. Semantics:
  - `accuracy = 0.5` (default) -> `f = 1` -> identity, reproducing the model's
    historical output exactly (a pinned regression guard).
  - `accuracy > 0.5` -> `f > 1` -> the favorite's probability is pushed harder
    toward `0.95` (more confident / aggressive).
  - `accuracy < 0.5` -> `f < 1` -> softened toward `0.5`; `accuracy = 0`
    collapses the favorite to exactly `0.5`.
  A non-finite `accuracy` falls back to the default; otherwise it is clamped
  into `[0, 1]`.
- Invariants hold for ALL accuracy values (verified by unit and fast-check
  property tests that sample accuracy across and slightly beyond the supported
  range): `favoriteWinProbability` in `[0.5, 0.95]`; favorite is one of the two
  series teams and is unaffected by accuracy; monotonic non-decreasing in
  accuracy for a given favored series; deterministic for identical inputs.

## Bedrock narrative - generateNarrative (localized + model-selectable)

`backend/src/bedrock/narrative.ts`, with the shared contract in
`shared/src/narrative.ts`:

- **Shared contract (`@mlb/shared`).** `shared/src/narrative.ts` is the single
  source of truth for the narrative language type (`NarrativeLanguage = 'en' |
  'ja'`, default `'en'`) and the selectable-model allowlist
  (`NARRATIVE_MODEL_OPTIONS`): the Amazon Nova family (`us.amazon.nova-micro-v1:0`,
  `us.amazon.nova-lite-v1:0`, `us.amazon.nova-pro-v1:0`) plus the Anthropic
  Claude Haiku inference profile (`us.anthropic.claude-haiku-4-5-20251001-v1:0`).
  The default model is `DEFAULT_NARRATIVE_MODEL_ID = 'us.amazon.nova-lite-v1:0'`
  (Nova Lite): an Amazon-family model per Issue #13, balancing quality, latency,
  and cost and supporting both on-demand and inference-profile invocation. Amazon
  Titan is NOT offered because it has no text-generation model in us-east-1
  (embeddings only). The ids are the `us.*` cross-region inference-profile ids
  verified via `aws bedrock list-foundation-models`/`list-inference-profiles`,
  matching the IAM `inference-profile/*` grant. `resolveModelId(id?)` validates a
  requested id against the allowlist and returns the default for anything
  unknown/missing (it never throws).
- `buildPrompt(series, prediction, language)` composes a concise analyst prompt
  from the matchup and the computed call, localized to EN or JA. Team club names
  stay in English (the i18n convention) while the surrounding instruction prose
  is localized; the numeric percentage is identical across languages.
- **Per-provider adapter.** The InvokeModel request/response JSON differs by
  provider, so the invoker selects a `ModelStrategy` from the model id
  (`strategyForModel`): an `anthropic.` id uses the Anthropic messages shape
  (`anthropic_version` + `messages[].content[].text`) and parses `content[].text`;
  an `amazon.` id (and the default) uses the Amazon Nova shape (`messages` +
  `inferenceConfig`) and parses `output.message.content[].text`.
- `RealBedrockInvoker` wraps `InvokeModelCommand`, shaping the body and parsing
  the text via the selected strategy; the model id defaults from
  `BEDROCK_MODEL_ID` (set by infra to the shared default) and is overridable per
  request.
- `generateNarrative(series, prediction, invoker?, modelId?, language?)` returns
  the Bedrock text, or the deterministic `fallbackNarrative(series, prediction,
  language)` on ANY error (model id suffixed `(fallback)`), so the prediction
  never hard-fails. The fallback is localized to the same language. This also
  means a selected model that is not yet *access-enabled* for Bedrock in the
  account/region degrades to the localized fallback at HTTP 200 rather than
  erroring (see Infrastructure note on Bedrock model access).
- The `BedrockInvoker` interface makes the AI path mockable in tests.

### Language + model request threading

The `lang` and `model` parameters are threaded end to end and parsed leniently
so an optional never causes a `400`:

- The SPA (`frontend/src/api.ts`) appends `&lang=<ui language>` and
  `&model=<selected id>` to the `/prediction` request. The default UI language
  is `ja`; the default model is Nova Lite.
- `backend/src/handlers/getPrediction.ts` parses `lang` and `model` from BOTH
  the GET query and the POST body via lenient helpers in
  `backend/src/handlers/http.ts` (mirroring `parseAccuracy`/`parseSeason`): an
  unrecognized `lang` or `model` yields `undefined` so the default applies, and
  neither ever produces a `400`.
- `BracketService.getPrediction(..., language?, model?)` resolves the model
  through the shared `resolveModelId` allowlist, reports the resolved id back on
  the `prediction` response `model` field, and passes the language + resolved id
  to `generateNarrative`.

## Data-integrity check - findIntegrityWarnings

`shared/src/integrity.ts` is a pure scan over the `Bracket` contract, and the
`/bracket` handler attaches its result (keeping the aggregator side-effect
free):

- The live 2026 feed can carry PLACEHOLDER team ids (e.g. "AL Higher Seed")
  absent from `TEAMS`. A placeholder is normal in a not-yet-started (scheduled)
  context; it is a DATA-INTEGRITY problem only when it appears in a context that
  is already FINISHED - a `final` series, or a decided game - because a completed
  matchup should reference the two real teams that played it.
- `findIntegrityWarnings(bracket)` returns an `IntegrityWarning[]` (code
  `finished_game_tbd_team`), one per finished context that references a
  placeholder/TBD team id; a clean bracket yields an empty array. Invariants are
  covered by `shared/src/integrity.property.test.ts`.
- `backend/src/handlers/getBracket.ts` calls `findIntegrityWarnings` AFTER
  `getBracket`, attaches the array to the HTTP 200 response as
  `integrityWarnings`, and (when non-empty) logs a `console.warn` summarizing the
  affected series ids. The status stays 200: the warning is non-blocking.
- The SPA (`frontend/src/pages/HomePage.tsx`) renders a non-blocking, localized
  (EN/JA) banner (`.app__notice--integrity`) when `integrityWarnings` is
  non-empty, and still renders the bracket; a clean bracket shows no banner.

## Data store

`backend/src/store/dynamo.ts` - `DynamoBracketStore` reads/writes the aggregated
bracket JSON in DynamoDB keyed by season (`BRACKET#<season>`), with a TTL so the
cache refreshes.

## Seed fallback

`shared/src/seed/` bundles deterministic datasets for the completed postseasons
and `getSeedBracket(season)` returns the matching bracket when the live MLB API
is unreachable:

- `postseason-2024.json` - the 2024 postseason (Dodgers over Yankees 4-1).
- `postseason-2025.json` - the 2025 postseason (Dodgers over Blue Jays 4-3),
  real data aggregated from the live MLB Stats API and committed with a stable
  `updatedAt` so the bundle stays deterministic.

`getSeedBracket` returns a bracket for 2024 and 2025 and `undefined` for any
other season (including the current 2026 season, which has no seed). The
`TEAMS` map in `shared/src/types.ts` was extended with the additional 2025
teams (111 Boston Red Sox, 112 Chicago Cubs, 113 Cincinnati Reds, 136 Seattle
Mariners, 141 Toronto Blue Jays). The frontend also falls back to the bundled
seed if a bracket request fails, so the demo renders offline.

## Infrastructure (CDK)

`infra/` provisions the whole stack in TypeScript: S3 + CloudFront (OAC), the
HTTP API + the two Lambdas, the DynamoDB table (TTL enabled), and Bedrock IAM
permissions. `npm run synth` produces the template; `npm run deploy` builds and
deploys in one command (requires active AWS credentials).

### Bedrock model id + IAM (selectable Amazon Nova / Claude)

- The prediction Lambda's `BEDROCK_MODEL_ID` env defaults to
  `DEFAULT_BEDROCK_MODEL_ID = 'us.amazon.nova-lite-v1:0'`, matching the
  backend/shared default (`DEFAULT_NARRATIVE_MODEL_ID`) so the deployed default
  and the code default agree. It is overridable at deploy time with
  `--context bedrockModelId=<id>`.
- The IAM policy grants `bedrock:InvokeModel` +
  `bedrock:InvokeModelWithResponseStream` on two wildcard resources:
  `arn:aws:bedrock:*::foundation-model/*` (spans regions) and
  `arn:aws:bedrock:*:<account>:inference-profile/*` (spans the account's
  profiles). An inference profile transparently routes to the underlying
  foundation model in any region of its geography, and Bedrock authorizes BOTH
  the inference-profile ARN and the underlying foundation-model ARN. These two
  resources therefore authorize invocation of BOTH the Anthropic Claude
  inference profile AND every Amazon Nova model/inference profile with no
  per-model IAM change. `infra/test/stack.test.ts` asserts the policy authorizes
  `bedrock:InvokeModel` on both ARN shapes and that `BEDROCK_MODEL_ID` is set on
  the prediction function.
- **Bedrock model access (deploy-time caveat).** IAM authorizes the API call,
  but each selected model must ALSO be *access-enabled* for Bedrock in the
  account/region (us-east-1), which is a runtime account setting that only
  surfaces at invoke time. If a selected model is not access-enabled, the
  deterministic templated fallback keeps `/prediction` returning HTTP 200 with a
  localized narrative; the operator should verify model access on redeploy for
  live generation from every selectable model.
