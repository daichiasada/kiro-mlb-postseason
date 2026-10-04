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
