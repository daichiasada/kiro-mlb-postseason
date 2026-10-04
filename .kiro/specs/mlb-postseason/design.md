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
          |          --->  Amazon Bedrock (Anthropic Claude)
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

### getPrediction(seriesId, season)

The method returns a `PredictionResponse` discriminated union (see the contract
above):

1. If `isResultsOnly(season)` (season `< CURRENT_YEAR`), short-circuit and
   return `{ mode: 'results', ... }` immediately. This happens BEFORE loading
   the bracket, running `predict()`, or invoking Bedrock, so a results-only
   season never pays for a prediction.
2. Otherwise `getBracket(season)` (same resolution order above).
3. `resolveSeries(bracket, seriesId)`: try an exact id match first; if that
   fails, parse the id and match by round slug plus the *unordered* team-id pair
   (this tolerates a high/low-seed ordering disagreement across the seed/live
   boundary - the ISSUE-1 fix).
4. If the series is not resolvable OR has not started, return
   `{ mode: 'upcoming', ... }` so an empty/placeholder-only 2026 bracket
   degrades gracefully instead of erroring. "Not started" means the series is
   `scheduled` OR has no decided game (no game with a real winner and no
   recorded win) - this catches the real preview-game shape, where the
   aggregator classifies a games-but-no-results series as `scheduled`.
5. Otherwise `predict(series, bracket, winPct)` to compute the favorite and
   probability, then `generateNarrative(series, result, invoker)` for the prose
   (deterministic fallback on any Bedrock error), returning
   `{ mode: 'prediction', ... }`.

The handler (`getPrediction.ts`) returns all three variants with HTTP 200; it
still responds `400` for a missing `seriesId` or an invalid `season`, and `500`
only if `getBracket` itself throws.

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
- The favorite is the higher-scoring team; `favoriteWinProbability` is that
  team's share of the combined score, clamped to `[0.5, 0.95]` and rounded to 4
  decimals.
- Invariants (verified by unit and fast-check property tests): probability in
  `[0.5, 0.95]`; favorite is one of the two series teams; deterministic for
  identical inputs.

## Bedrock narrative - generateNarrative

`backend/src/bedrock/narrative.ts`:

- `buildPrompt` composes a concise analyst prompt from the matchup and the
  computed call.
- `RealBedrockInvoker` wraps `InvokeModelCommand` for Anthropic Claude
  (`anthropic.claude-3-haiku-...`, overridable via `BEDROCK_MODEL_ID`) and
  parses the `content[].text` blocks.
- `generateNarrative` returns the Bedrock text, or `fallbackNarrative` on any
  error (model id suffixed `(fallback)`), so the prediction never hard-fails.
- The `BedrockInvoker` interface makes the AI path mockable in tests.

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
