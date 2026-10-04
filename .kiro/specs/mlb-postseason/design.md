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
          |          --->  bundled 2024 seed (shared/src/seed)
```

All components are TypeScript. The backend collaborators are injectable so the
service is unit-testable with no network or AWS access.

## Frontend

- React + Vite single-page app, deployed as a static bundle to a private S3
  bucket fronted by CloudFront with Origin Access Control.
- The API base URL is injected at runtime through a `/config.js` asset
  (`window.__API_BASE_URL__`), so the same bundle works across environments.
- Components: a bracket view (series cards ordered by round), a standings /
  summary panel grouping teams by league, and a prediction panel.
- Playwright e2e specs in `frontend/e2e/` drive these flows.

## API and Lambdas

Two Node 20 Lambdas behind an API Gateway HTTP API with CORS:

- `backend/src/handlers/getBracket.ts` - `GET /bracket?season=YYYY`. Parses and
  validates the season, calls `BracketService.getBracket`, returns the bracket
  JSON or `400`/`500`.
- `backend/src/handlers/getPrediction.ts` - `GET`/`POST /prediction`. Parses
  `seriesId` + `season`, calls `BracketService.getPrediction`, returns the
  prediction, or `400` (missing seriesId), `404` (`SeriesNotFoundError`), or
  `500`.
- `backend/src/handlers/http.ts` provides `jsonResponse` (with CORS headers) and
  `parseSeason`.

## BracketService resolution order

`backend/src/service/bracketService.ts` orchestrates everything.

### getBracket(season)

1. Read the DynamoDB cache (`store.getCachedBracket`). On a hit, return it.
2. On a miss, `fetchPostseasonSchedule(season)` -> `aggregateBracket(games,
   season)` -> `store.putCachedBracket(bracket)` -> return the fresh bracket.
3. On an MLB fetch error, return `getSeedBracket(season)` when it exists
   (season 2024), otherwise rethrow.

### getPrediction(seriesId, season)

1. `getBracket(season)` (same resolution order above).
2. `resolveSeries(bracket, seriesId)`: try an exact id match first; if that
   fails, parse the id and match by round slug plus the *unordered* team-id pair
   (this tolerates a high/low-seed ordering disagreement across the seed/live
   boundary - the ISSUE-1 fix). Return `404` when neither strategy resolves.
3. `predict(series, bracket, winPct)` to compute the favorite and probability.
4. `generateNarrative(series, result, invoker)` for the prose, with the
   deterministic fallback on any Bedrock error.

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
  no games, else `in_progress`.
- Series ids are `${season}-${league}-${roundSlug}-${highId}-${lowId}`.

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

`shared/src/seed/` bundles the deterministic 2024 postseason dataset
(`postseason-2024.json`) and `getSeedBracket(season)` returns it for season
2024, used when the live MLB API is unreachable.

## Infrastructure (CDK)

`infra/` provisions the whole stack in TypeScript: S3 + CloudFront (OAC), the
HTTP API + the two Lambdas, the DynamoDB table (TTL enabled), and Bedrock IAM
permissions. `npm run synth` produces the template; `npm run deploy` builds and
deploys in one command (requires active AWS credentials).
