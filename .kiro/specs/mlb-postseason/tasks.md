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

## UX, i18n, and configurable accuracy (task-ux-i18n-accuracy)

A follow-up task set under `.agents/tasks/task-ux-i18n-accuracy/` (features
FEAT-001 through FEAT-005) implements six UX/behavior requirements on top of the
year-aware app: a layout-alignment fix, a collapsed-by-default game-detail
toggle, a finished-series detail page via client-side routing, finished-series
prediction turned OFF at the series level (backend + frontend), a JA/EN language
switch, and a configurable prediction-accuracy parameter.

### U1. Verify green baseline (task-ux-i18n-accuracy FEAT-001)

- [x] Confirm build/test/e2e/synth are green before starting the feature work.
- _Requirements: 6, 7, 8, 9, 10, 11 (baseline)_

### U2. Configurable accuracy + series-level final gating, backend (task-ux-i18n-accuracy FEAT-002)

- [x] Add the `accuracy` sharpness control to the pure model (4th positional
      arg, range `[0, 1]`, default `0.5`, `f = 2 * accuracy` sharpening), with
      invariants holding for all accuracy values.
      - `backend/src/predict/model.ts`, `backend/src/predict/model.test.ts`,
        `backend/src/predict/model.property.test.ts`.
- [x] Series-level finished-series gating in `getPrediction` (final series ->
      `mode: 'results'`, no predict/Bedrock, even in the current season) and
      thread `accuracy` through handler -> service -> `predict()`; parse
      `accuracy` from GET query and POST body (never a `400`).
      - `backend/src/service/bracketService.ts`,
        `backend/src/service/bracketService.test.ts`,
        `backend/src/handlers/getPrediction.ts`, `backend/src/handlers/http.ts`,
        `backend/src/handlers/getPrediction.test.ts`.
- _Requirements: 9, 11_

### U3. Routing, detail page, collapsible toggle, layout fix (task-ux-i18n-accuracy FEAT-003)

- [x] Path-based client-side routing (`react-router-dom` v6 `BrowserRouter`),
      compatible with the CloudFront `/index.html` rewrite; route table in
      `App.tsx`; season from the route param.
      - `frontend/src/main.tsx`, `frontend/src/App.tsx`,
        `frontend/src/pages/HomePage.tsx`, `frontend/src/seasonRoute.ts`.
- [x] Finished-series detail page + friendly not-found; collapsed-by-default
      game-detail toggle; bracket layout-alignment fix.
      - `frontend/src/pages/SeriesDetailPage.tsx`,
        `frontend/src/components/SeriesCard.tsx`,
        `frontend/src/components/BracketView.tsx`, `frontend/src/styles.css`,
        `frontend/e2e/detail.spec.ts`, `frontend/e2e/fixtures.ts`.
- _Requirements: 6, 7, 8, 9_

### U4. JA/EN i18n (task-ux-i18n-accuracy FEAT-004)

- [x] Lightweight in-repo i18n context (no new dependency): flat dotted-key
      dictionary, `useI18n()` + `t()`, round/status/team helpers, default `ja`,
      `localStorage` persistence, localized unknown-team fallback.
      - `frontend/src/i18n/messages.ts`, `frontend/src/i18n/index.ts`,
        `frontend/src/components/LanguageToggle.tsx`,
        `frontend/src/i18n/index.test.ts`,
        `frontend/src/components/LanguageToggle.test.tsx`,
        `frontend/e2e/i18n.spec.ts`.
- [x] Localize all existing UI strings across the components.
- _Requirements: 10_

### U5. Accuracy control UI + final-series prediction-OFF UI + spec/README (task-ux-i18n-accuracy FEAT-005)

- [x] Accessible, localized accuracy slider in the prediction panel (default
      `0.5`, step `0.05`), debounced re-request appending `&accuracy=`; threads
      accuracy through `api.ts`.
      - `frontend/src/components/PredictionPanel.tsx`, `frontend/src/api.ts`,
        `frontend/src/config.ts`, `frontend/src/i18n/messages.ts`,
        `frontend/src/components/PredictionPanel.test.tsx`.
- [x] Finished-series prediction-OFF UI consistency (no predict button, detail
      link instead, never a numeric prediction) with e2e coverage; accuracy e2e
      capturing the query param.
      - `frontend/e2e/prediction.spec.ts`, `frontend/e2e/fixtures.ts`.
- [x] Keep the spec-driven-dev artifacts and README truthful.
      - `.kiro/specs/mlb-postseason/requirements.md`,
        `.kiro/specs/mlb-postseason/design.md`,
        `.kiro/specs/mlb-postseason/tasks.md`, `README.md`.
- _Requirements: 6, 7, 8, 9, 10, 11_

## Localized narrative, selectable models, and data integrity (task-issue-13-localize-models-integrity)

GitHub Issue #13 under `.agents/tasks/task-issue-13-localize-models-integrity/`
(features FEAT-001 through FEAT-005): localize the AI narrative to the UI
language (EN/JA), make the Bedrock model selectable (Amazon Nova family, default
Nova Lite; Claude kept available) via a per-provider request/response adapter
with the deterministic fallback intact, and add a finished-game TBD
data-integrity check that surfaces non-blocking warnings. Language + model are
threaded UI -> api -> handler -> service -> narrative.

### I1. Verify green baseline (task-issue-13 FEAT-001)

- [x] Confirm build/test/e2e/synth are green before starting the feature work.
- _Requirements: 3, 12 (baseline)_

### I2. Localized narrative + selectable Amazon Nova models, backend (task-issue-13 FEAT-002)

- [x] Shared narrative contract: `NarrativeLanguage` (default `en`), the
      `NARRATIVE_MODEL_OPTIONS` allowlist (Nova micro/lite/pro + Claude Haiku),
      `DEFAULT_NARRATIVE_MODEL_ID = 'us.amazon.nova-lite-v1:0'`, and
      `resolveModelId`.
      - `shared/src/narrative.ts`, `shared/src/index.ts`.
- [x] Language-aware prompt + fallback and a per-provider request/response
      adapter (Anthropic messages vs Amazon Nova `messages`/`inferenceConfig`);
      thread `language` + resolved `model` through the service and handler
      (lenient parse, never a `400`).
      - `backend/src/bedrock/narrative.ts`,
        `backend/src/bedrock/narrative.test.ts`,
        `backend/src/service/bracketService.ts`,
        `backend/src/service/bracketService.test.ts`,
        `backend/src/handlers/getPrediction.ts`, `backend/src/handlers/http.ts`,
        `backend/src/handlers/getPrediction.test.ts`.
- _Requirements: 3_

### I3. Finished-game TBD data-integrity check (task-issue-13 FEAT-003)

- [x] Pure `findIntegrityWarnings` scan over the bracket for finished contexts
      referencing a placeholder/TBD team, surfaced on the `/bracket` 200
      response and logged server-side.
      - `shared/src/integrity.ts`, `shared/src/index.ts`,
        `shared/src/integrity.property.test.ts`,
        `backend/src/handlers/getBracket.ts`,
        `backend/src/handlers/getBracket.test.ts`.
- _Requirements: 12_

### I4. Frontend model selector, language passthrough, integrity banner (task-issue-13 FEAT-004)

- [x] Model selector near the accuracy slider, `&lang=`/`&model=` passthrough,
      and a non-blocking localized integrity banner.
      - `frontend/src/components/PredictionPanel.tsx`, `frontend/src/api.ts`,
        `frontend/src/config.ts`, `frontend/src/i18n/messages.ts`,
        `frontend/src/pages/HomePage.tsx`, `frontend/e2e/prediction.spec.ts`,
        `frontend/e2e/fixtures.ts`.
- _Requirements: 3, 10, 12_

### I5. Infra IAM/default-model confirmation + docs + full verification (task-issue-13 FEAT-005)

- [x] Confirm the IAM covers the Amazon Nova foundation-model + inference-profile
      ARNs, set the Lambda default `BEDROCK_MODEL_ID` to the shared default
      (Nova Lite), and assert both in the stack tests.
      - `infra/lib/mlb-postseason-stack.ts`, `infra/test/stack.test.ts`.
- [x] Keep the spec-driven-dev artifacts, README/README.ja.md, and steering
      truthful to the localized narrative, selectable Amazon models + per-provider
      adapter + fallback, the default-model choice, the request threading, the
      integrity check, and the Bedrock model-access deploy caveat.
      - `.kiro/specs/mlb-postseason/requirements.md`,
        `.kiro/specs/mlb-postseason/design.md`,
        `.kiro/specs/mlb-postseason/tasks.md`, `README.md`, `README.ja.md`,
        `.kiro/steering/product.md`, `.kiro/steering/tech.md`.
- _Requirements: 3, 12_
