# Requirements - MLB Postseason Summary Site

Spec-driven development artifact. These requirements use EARS-style acceptance
criteria (WHEN/THEN, plus IF/THEN for error paths) and describe the system that
is actually implemented in this repository, not a hypothetical one.

## Introduction

A lightweight, serverless, public read-only web app that gives a graphical
summary of the MLB postseason and an AI-assisted win/loss prediction for any
series. Built end to end in TypeScript and deployed to AWS with one command via
AWS CDK.

## Requirement 1 - Graphical bracket view

**User story:** As a baseball fan, I want to see the postseason as a graphical
bracket, so that I can understand how teams advance from the Wild Card round
through the World Series at a glance.

### Acceptance criteria

1. WHEN the SPA loads THEN the system SHALL request the aggregated bracket for
   the current default season (2024) from `GET /bracket?season=YYYY`.
2. WHEN the bracket is returned THEN the system SHALL render each series with
   both teams, the current series score (`high.wins` vs `low.wins`), the round,
   the league (`AL | NL | WS`), and the status (`scheduled | in_progress |
   final`).
3. WHEN series are rendered THEN the system SHALL order them by round
   progression (Wild Card, Division Series, Championship Series, World Series).
4. WHEN a user opens a series THEN the system SHALL show the game-by-game
   results for that series.
5. IF the viewport is narrow THEN the bracket SHALL NOT overflow horizontally
   (regression fixed under ISSUE in the issue registry).

## Requirement 2 - Win/loss prediction

**User story:** As a fan, I want a predicted favorite and win probability for a
series, so that I can see who is likely to advance and why.

### Acceptance criteria

1. WHEN a user requests a prediction for a series THEN the system SHALL call
   `GET /prediction?seriesId=...&season=YYYY` (or the equivalent POST body).
2. WHEN a prediction is computed THEN `favoriteWinProbability` SHALL be within
   the inclusive range `[0.5, 0.95]`.
3. WHEN a prediction is computed THEN `favoriteTeamId` SHALL be one of the two
   teams in the requested series.
4. WHEN the series is even on wins THEN the system SHALL break the tie toward
   the high seed using a small home-field edge.
5. IF `seriesId` is missing or empty THEN the system SHALL respond `400`.
6. IF the requested series cannot be resolved THEN the system SHALL respond
   `404` with a `SeriesNotFoundError` message.

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
3. IF the live MLB fetch fails AND `season === 2024` THEN the system SHALL
   return the bundled 2024 seed dataset.
4. IF the live MLB fetch fails AND no seed exists for the season THEN the system
   SHALL rethrow so the handler responds `500`.
5. WHEN games are aggregated THEN they SHALL be grouped into series by
   `(seriesDescription + unordered team pair)` and the high seed SHALL be the
   home team of game 1.

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
