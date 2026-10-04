# Implementation tasks - MLB Postseason Summary Site

Spec-driven development artifact. This task breakdown maps to the real work done
in this repository (features FEAT-001 through FEAT-007 under
`.agents/tasks/task-mlb-postseason-site/`) and the files that implement each
piece. It is kept consistent with `requirements.md` and `design.md`.

## 1. Shared domain + seed (FEAT-001)

- [x] Define the shared domain types that cross the API boundary.
      - `shared/src/types.ts` (Team, Game, Series, Bracket, Prediction, TEAMS)
- [x] Bundle a deterministic 2024 fallback dataset.
      - `shared/src/seed/postseason-2024.json`, `shared/src/seed/index.ts`
- _Requirements: 1, 4_

## 2. MLB data layer (FEAT-002)

- [x] Thin MLB Stats API client over global `fetch`.
      - `backend/src/mlb/client.ts`
- [x] Pure aggregation of raw games into the bracket shape.
      - `backend/src/mlb/aggregate.ts`, `backend/src/mlb/aggregate.test.ts`
- _Requirements: 1, 4_

## 3. Prediction model (FEAT-002)

- [x] Deterministic, explainable win/loss model (pure function).
      - `backend/src/predict/model.ts`, `backend/src/predict/model.test.ts`
- _Requirements: 2_

## 4. Bedrock narrative with fallback (FEAT-002)

- [x] Mockable Bedrock invoker + deterministic fallback narrative.
      - `backend/src/bedrock/narrative.ts`,
        `backend/src/bedrock/narrative.test.ts`
- _Requirements: 3_

## 5. Service + handlers + store (FEAT-002)

- [x] BracketService orchestration with the documented resolution order.
      - `backend/src/service/bracketService.ts`,
        `backend/src/service/bracketService.test.ts`
- [x] DynamoDB cache store keyed by season with TTL.
      - `backend/src/store/dynamo.ts`
- [x] Lambda handlers for `/bracket` and `/prediction` with CORS + validation.
      - `backend/src/handlers/getBracket.ts`,
        `backend/src/handlers/getPrediction.ts`,
        `backend/src/handlers/http.ts`
- _Requirements: 1, 2, 3, 4_

## 6. Frontend SPA (FEAT-003)

- [x] React/Vite SPA: bracket view, standings panel, prediction panel.
      - `frontend/src/`
- [x] Runtime API base URL injection via `/config.js`.
- _Requirements: 1, 2, 5_

## 7. Playwright e2e + UI fix (FEAT-005)

- [x] Playwright e2e specs for the main flows.
      - `frontend/e2e/home.spec.ts`, `frontend/e2e/prediction.spec.ts`,
        `frontend/e2e/fixtures.ts`
- [x] Narrow-screen bracket overflow fix surfaced by the e2e run (ISSUE-5).
      - `frontend/src/styles.css`
- _Requirements: 5_

## 8. Infrastructure as Code + README (FEAT-004)

- [x] CDK stack: S3 + CloudFront (OAC), HTTP API + two Lambdas, DynamoDB (TTL),
      Bedrock IAM; one-command deploy + synth.
      - `infra/lib/`, `infra/bin/app.ts`
- [x] README covering one-command deploy and local development.
      - `README.md`
- _Requirements: 1, 5_

## 9. Issue registry and fixes (FEAT-006)

- [x] Issue registry and autonomous fixes (ISSUE-1 series resolution, ISSUE-2
      Bedrock test, ISSUE-3/4 single BucketDeployment + stack assertions).
      - `ISSUES.md`
- _Requirements: 1, 5_

## 10. Kiro University lesson artifacts (FEAT-007)

- [x] Spec-driven development: this `.kiro/specs/mlb-postseason/` set.
- [x] Steering docs: `.kiro/steering/*.md` (kiro-university, product, tech,
      structure, testing).
- [x] Agent hooks: `.kiro/hooks/*.kiro.hook`.
- [x] Property-based tests (IDE-only): `backend/src/**/*.property.test.ts`.
- [x] Powers writeup + packaged power: `powers/mlb-postseason/`.
- [x] MCP config: `.kiro/settings/mcp.json`.
- [x] Custom agent: `.kiro/agents/mlb-postseason-dev.json`.
- [x] Judge-facing summary: `DEMONSTRATED_LESSONS.md`.
- _Requirements: all (meta/documentation)_

## Multi-season support (task-multi-season)

A later task set under `.agents/tasks/task-multi-season/` (features FEAT-001
through FEAT-004) made the app year-aware: the current year is 2026, 2024/2025
are results-only, 2026 is the predictable current season, and a season selector
switches between them. These tasks build on the FEAT-001..007 work above and do
not change the mapping of those sections.

### M1. Year-aware season config + 2025 seed (task-multi-season FEAT-001)

- [x] Single source of truth for "now" and selectable seasons in `@mlb/shared`.
      - `shared/src/season.ts` (`CURRENT_YEAR = 2026`,
        `SELECTABLE_SEASONS = [2026, 2025, 2024]`, `seasonMode`,
        `isResultsOnly`, `isPredictable`), re-exported from
        `shared/src/index.ts`.
- [x] Real aggregated 2025 seed dataset and extended teams.
      - `shared/src/seed/postseason-2025.json` (Dodgers over Blue Jays 4-3),
        `shared/src/seed/index.ts` (`getSeedBracket` serves 2024 and 2025),
        `shared/src/types.ts` (`TEAMS` extended with the 2025 teams).
- _Requirements: 1, 4_

### M2. Year-aware backend + results-only prediction contract (task-multi-season FEAT-002)

- [x] Default season derived from `CURRENT_YEAR`.
      - `backend/src/handlers/http.ts` (`DEFAULT_SEASON = CURRENT_YEAR`).
- [x] `PredictionResponse` discriminated union (prediction | results | upcoming),
      always HTTP 200; results-only seasons short-circuit before predict/Bedrock;
      current-season unresolvable/not-started series return `upcoming`.
      - `shared/src/types.ts` (`PredictionResponse`),
        `backend/src/service/bracketService.ts`,
        `backend/src/handlers/getPrediction.ts`.
- [x] Placeholder-team tolerance in aggregation for the live 2026 schedule.
      - `backend/src/mlb/aggregate.ts`.
- _Requirements: 1, 2, 4_

### M3. Season selector + conditional prediction UI (task-multi-season FEAT-003)

- [x] Labeled season selector over `SELECTABLE_SEASONS`, default `CURRENT_YEAR`;
      switching re-fetches and clears the selected series.
      - `frontend/src/App.tsx`, `frontend/src/config.ts`.
- [x] Prediction UI gated by `isPredictable`: hidden for 2024/2025 (results-only
      "Final results" + "View details"), shown for 2026; graceful
      "has not started yet" empty state for the current season.
      - `frontend/src/App.tsx`, `frontend/src/components/PredictionPanel.tsx`,
        `frontend/src/components/BracketView.tsx`,
        `frontend/src/components/SeriesCard.tsx`.
- _Requirements: 1, 2, 5_

### M4. Spec, README, and steering updates (task-multi-season FEAT-004)

- [x] Keep the spec-driven-dev artifacts, README, and steering truthful to the
      multi-season behavior.
      - `.kiro/specs/mlb-postseason/requirements.md`,
        `.kiro/specs/mlb-postseason/design.md`,
        `.kiro/specs/mlb-postseason/tasks.md`, `README.md`,
        `.kiro/steering/product.md`.
- _Requirements: 1, 2, 4, 5_
