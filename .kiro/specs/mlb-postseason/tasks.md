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

## 3. Prediction model (FEAT-003)

- [x] Deterministic, explainable win/loss model (pure function).
      - `backend/src/predict/model.ts`, `backend/src/predict/model.test.ts`
- _Requirements: 2_

## 4. Bedrock narrative with fallback (FEAT-004)

- [x] Mockable Bedrock invoker + deterministic fallback narrative.
      - `backend/src/bedrock/narrative.ts`,
        `backend/src/bedrock/narrative.test.ts`
- _Requirements: 3_

## 5. Service + handlers + store (FEAT-005)

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

## 6. Frontend SPA + e2e (FEAT-005)

- [x] React/Vite SPA: bracket view, standings panel, prediction panel.
      - `frontend/src/`
- [x] Runtime API base URL injection via `/config.js`.
- [x] Playwright e2e specs for the main flows.
      - `frontend/e2e/home.spec.ts`, `frontend/e2e/prediction.spec.ts`,
        `frontend/e2e/fixtures.ts`
- _Requirements: 1, 2, 5_

## 7. Infrastructure as Code (FEAT-006)

- [x] CDK stack: S3 + CloudFront (OAC), HTTP API + two Lambdas, DynamoDB (TTL),
      Bedrock IAM; one-command deploy + synth.
      - `infra/lib/`, `infra/bin/app.ts`
- [x] Issue registry and fixes (ISSUE-1 series resolution, ISSUE-2 Bedrock test,
      ISSUE-3/4 single BucketDeployment + stack assertions).
      - `ISSUES.md`
- _Requirements: 1, 5_

## 8. Kiro University lesson artifacts (FEAT-007)

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
