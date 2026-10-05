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

## Regular-season win pct into predictions (task-issue-15-regular-season-winpct)

GitHub Issue #15 under `.agents/tasks/task-issue-15-regular-season-winpct/`
(features FEAT-001 through FEAT-003): feed the real regular-season win pct into
the prediction model. Fetch the MLB Stats API standings, aggregate them to a
per-team win-pct map with a PURE function, cache the map per season in DynamoDB
(`STANDINGS#<season>`, same TTL as the bracket cache, no infra change), wire it
into `BracketService.getPrediction` -> `predict()`, fall back to neutral 0.5 on
ANY failure while always returning a prediction, and surface the metrics used in
the `PredictionPanel` (localized EN/JA). Only the win-pct signal is wired; no
Pythagorean/last-10 signal was added.

### S1. Backend: standings fetch, pure aggregation, cache, wiring (task-issue-15 FEAT-001)

- [x] Additive `Prediction.metrics` contract: `PredictionMetrics`
      (`{ favorite, underdog }`) and `TeamMetric` (`{ teamId, winPct: number |
      null }`), optional so the `results`/`upcoming` variants are unchanged.
      - `shared/src/types.ts`, `shared/src/index.ts` (barrel).
- [x] MLB standings client fetch and the PURE win-pct aggregation + metric
      helper (parses `.580`/`0.580`, skips missing id / unparseable, `{}` for
      early-season, never throws), unit-tested with the MLB API mocked.
      - `backend/src/mlb/client.ts` (`fetchStandings`, `RawStandingsResponse`),
        `backend/src/predict/standings.ts`
        (`winPctFromStandings`, `teamMetric`),
        `backend/src/predict/standings.test.ts`.
- [x] Per-season standings cache (`STANDINGS#<season>`, same TTL as the bracket
      cache, single-pk table so no infra change) and the
      `resolveWinPct` resolution order (injected map -> cache hit -> live
      fetch+aggregate+write-back -> neutral `{}` on any failure); feed `winPct`
      into `predict()` and attach the `metrics` object to the `mode:
      'prediction'` response.
      - `backend/src/store/dynamo.ts`
        (`getCachedStandings`/`putCachedStandings`),
        `backend/src/service/bracketService.ts`,
        `backend/src/service/bracketService.test.ts`.
- _Requirements: 2, 13_

### S2. Frontend: explainable "prediction basis" in the panel (task-issue-15 FEAT-002)

- [x] Localized `prediction.metrics.*` strings (EN/JA) and a guarded
      "Prediction basis" block in the prediction panel showing each team's
      regular-season win pct (or a localized "not available" when `null`),
      backward compatible for responses without `metrics`.
      - `frontend/src/i18n/messages.ts`,
        `frontend/src/components/PredictionPanel.tsx`,
        `frontend/src/styles.css`,
        `frontend/src/components/PredictionPanel.test.tsx`,
        `frontend/e2e/prediction.spec.ts`, `frontend/e2e/fixtures.ts`.
- _Requirements: 10, 13_

### S3. Spec + README truthfulness (task-issue-15 FEAT-003)

- [x] Keep the spec-driven-dev artifacts and both READMEs truthful to the
      standings-driven win pct, the `STANDINGS#<season>` cache, the neutral
      fallback, and the explainable-metrics UI, without overstating (no
      Pythagorean/last-10 signal is claimed).
      - `.kiro/specs/mlb-postseason/requirements.md`,
        `.kiro/specs/mlb-postseason/design.md`,
        `.kiro/specs/mlb-postseason/tasks.md`, `README.md`, `README.ja.md`.
- _Requirements: 2, 13_

### B1. Shared: pure deterministic backtest engine + relocate predict() (task-issue-16 FEAT-002)

- [x] Move the pure `predict()` into `shared/src/predict.ts` and re-export it
      from `backend/src/predict/model.ts` with no behavior change; existing
      backend predict tests stay green unchanged.
- [x] Add `shared/src/backtest.ts` (`runBacktest`, `runMultiSeasonBacktest`,
      `runBacktestAcrossAccuracies` + result types) importing only pure shared
      code and the seed JSON (no AWS/Bedrock/network), with "predict at the end
      of game k" semantics, hit rate, Brier score, and fixed-bucket calibration.
- [x] Pin exact `hitRate`/`brierScore` for 2024, 2025, and combined at accuracy
      0.5, plus the `accuracy=0 => brierScore 0.25` invariant and calibration
      count invariants, in unit + fast-check property tests.
      - `shared/src/predict.ts`, `shared/src/backtest.ts`,
        `shared/src/index.ts`, `backend/src/predict/model.ts`,
        `shared/src/backtest.test.ts`, `shared/src/backtest.property.test.ts`.
- _Requirements: Model accuracy / backtest 1, 3_

### B2. Frontend + docs: client-side Model accuracy page (task-issue-16 FEAT-003)

- [x] New localized `accuracy.*` i18n keys (EN + JA) including the Brier and
      calibration definitions; a `/accuracy` route and `AccuracyPage.tsx` that
      computes metrics client-side via the shared engine (no backend endpoint,
      no infra change), rendering the metric definitions, the multi-accuracy
      comparison (hit rate + Brier for 2024/2025/combined across
      `[0,0.25,0.5,0.75,1]`), and an accessible per-bucket calibration display.
- [x] A visible localized nav link from the home header reachable in every
      season; a frontend unit test and a Playwright e2e spec asserting the three
      metrics, the metric explanations (JA by default and EN via the toggle),
      and the multi-accuracy comparison; both READMEs document the feature.
      - `frontend/src/i18n/messages.ts`, `frontend/src/pages/AccuracyPage.tsx`,
        `frontend/src/App.tsx`, `frontend/src/pages/HomePage.tsx`,
        `frontend/src/styles.css`, `frontend/src/pages/AccuracyPage.test.tsx`,
        `frontend/e2e/accuracy.spec.ts`, `README.md`, `README.ja.md`.
- _Requirements: Model accuracy / backtest 2, 4, 5, 6_

## Dark mode and accessibility (task-issue-22-dark-mode-a11y)

GitHub Issue #22 under `.agents/tasks/task-issue-22-dark-mode-a11y/` (features
FEAT-001 through FEAT-003): a frontend-only System/Light/Dark theme that follows
`prefers-color-scheme` and persists to `localStorage['mlb.theme']`, WCAG-AA
badge text color, keyboard navigation + screen-reader labels for the bracket,
and an automated axe check across both themes. No backend or infra change.

### A1. Theming core + AA badge text color (task-issue-22 FEAT-001)

- [x] Pure, framework-free theme model: the `ThemePreference`/`ResolvedTheme`
      types, the `mlb.theme` key, guarded `readStoredTheme`/`storeTheme`, the
      pure `resolveTheme`, and `getSystemPrefersDark` (all jsdom/SSR safe).
      - `frontend/src/theme.ts`, `frontend/src/theme.test.ts`.
- [x] React glue: `ThemeProvider` mounted above the router applies the resolved
      theme to `<html data-theme>`, hydrates from `localStorage` (default
      `system`), and subscribes to `matchMedia` so `system` reacts live; a
      header `ThemeToggle` (role=group, `aria-pressed`) switches + persists.
      - `frontend/src/ThemeContext.tsx`, `frontend/src/components/ThemeToggle.tsx`,
        `frontend/src/components/ThemeToggle.test.tsx`, `frontend/src/main.tsx`,
        `frontend/index.html` (no-flash inline script),
        `frontend/src/i18n/messages.ts` (`app.theme.*` keys, EN + JA).
- [x] CSS-variable light/dark palettes on `:root` / `[data-theme='dark']`, every
      pair AA-compliant; computed AA team-badge text color.
      - `frontend/src/styles.css`, `frontend/src/readableTextColor.ts`,
        `frontend/src/readableTextColor.test.ts`,
        `frontend/src/components/TeamBadge.tsx`.
- _Requirements: 15_

### A2. Bracket keyboard navigation + screen-reader labels (task-issue-22 FEAT-002)

- [x] Roving-tabindex model (one tabbable card), arrow-key movement within and
      across round columns, Enter/Space opening a finished series' detail route,
      a theme-aware `:focus-visible` ring, and accessible per-card labels
      announcing teams/status/score; Playwright keyboard spec.
      - `frontend/src/components/BracketView.tsx`,
        `frontend/src/components/SeriesCard.tsx`, `frontend/src/styles.css`,
        `frontend/e2e/keyboard.spec.ts`.
- _Requirements: 15_

### A3. Automated axe verification, dark/light legibility, docs (task-issue-22 FEAT-003)

- [x] `@axe-core/playwright` e2e (`AxeBuilder`, WCAG 2.1 A/AA tags) over the home
      bracket, a finished-series detail page, and the accuracy page in BOTH
      light and dark, asserting zero `serious`/`critical` violations; the theme
      is seeded via `localStorage['mlb.theme']` before load and confirmed on
      `<html data-theme>`. A diagnostic dark-mode home screenshot is captured to
      the gitignored `frontend/test-results`.
      - `frontend/e2e/a11y.spec.ts`, `frontend/package.json`
        (`@axe-core/playwright` devDependency).
- [x] Fix the dark-mode contrast failures the axe scan surfaced by splitting the
      navy text role into a brightened `--heading` CSS variable (headings,
      panel/detail titles, game numbers, back links) without lightening the navy
      fills; confirm the SVG league marks/logos stay legible on dark.
      - `frontend/src/styles.css`.
- [x] Keep the spec-driven-dev artifacts and both READMEs truthful to the dark
      mode + accessibility feature as built.
      - `.kiro/specs/mlb-postseason/requirements.md`,
        `.kiro/specs/mlb-postseason/design.md`,
        `.kiro/specs/mlb-postseason/tasks.md`, `README.md`, `README.ja.md`.
- _Requirements: 15_

## Local game start times, today/tomorrow, and .ics (task-issue-20-game-times)

GitHub Issue #20 under `.agents/tasks/task-issue-20-game-times/` (features
FEAT-002 through FEAT-005): preserve each game's real first-pitch time end to
end and display it in the viewer's own timezone (EN/JA), add a today/tomorrow
section with a countdown, and let a fan export a game to their calendar as a
client-side `.ics`. The shared contract change is additive and backward
compatible; everything user-facing is frontend, built from pure helpers in the
house style. No new backend endpoint and no infra/IAM change.

### G1. Shared contract + backend aggregation of start time + TBD (task-issue-20 FEAT-002)

- [x] Additive OPTIONAL `GameResult.startTime?` (full ISO UTC datetime verbatim
      from `gameDate`) and `GameResult.timeTbd?`; the existing `date` (date-only
      `YYYY-MM-DD`) is UNCHANGED for backward compatibility.
      - `shared/src/types.ts`.
- [x] `aggregateBracket` still sets `date = gameDate.slice(0, 10)` and
      additionally sets `startTime` (verbatim `gameDate`) and derives `timeTbd`
      (true when `status.startTimeTBD === true` OR `gameDate` is a
      midnight-UTC/unparseable date-only placeholder; `startTime` omitted when
      TBD); `RawGame.status` gains an optional `startTimeTBD`.
      - `backend/src/mlb/aggregate.ts`, `backend/src/mlb/aggregate.test.ts`,
        `backend/src/mlb/client.ts`.
- _Requirements: 16_

### G2. Pure frontend helpers: local-time format, today/tomorrow, .ics (task-issue-20 FEAT-003)

- [x] Dependency-free, injected-input helpers with colocated EN/JA tests
      mirroring `relativeTime.ts`: `formatStartTime` + `resolveTimeZone`
      (localized `Intl.DateTimeFormat`, `ja-JP` 24h vs `en-US` 12h, localized
      Time-TBD label), `bucketGameDay`/`selectUpcomingGames` + `countdownParts`
      (today/tomorrow by LOCAL calendar day, TBD skipped, countdown clamped at
      0), and `buildIcs` (deterministic single-VEVENT VCALENDAR, UTC
      DTSTART/DTEND, RFC5545 escaping, default 180-min duration).
      - `frontend/src/gameTime.ts`, `frontend/src/gameTime.test.ts`,
        `frontend/src/upcomingGames.ts`, `frontend/src/upcomingGames.test.ts`,
        `frontend/src/ics.ts`, `frontend/src/ics.test.ts`.
- _Requirements: 16_

### G3. UI wiring + i18n + e2e (task-issue-20 FEAT-004)

- [x] Per-game local start time (or Time TBD) and a client-side "Add to
      calendar" `.ics` download for timed games on the series card; local
      time/Time TBD on the detail page; a "Today's and tomorrow's games" section
      with a countdown on the home page that renders nothing when empty.
      - `frontend/src/components/SeriesCard.tsx`,
        `frontend/src/pages/SeriesDetailPage.tsx`,
        `frontend/src/pages/HomePage.tsx`,
        `frontend/src/components/UpcomingGames.tsx`.
- [x] New EN/JA i18n keys (`gametime.*`, `ics.*`, `upcoming.*`) and a Playwright
      e2e asserting the local time / Time TBD, the today/tomorrow section, and
      the `.ics` affordance for a timed game.
      - `frontend/src/i18n/messages.ts`, `frontend/e2e/*.spec.ts`,
        `frontend/e2e/fixtures.ts`.
- _Requirements: 16_

### G4. Spec + README truthfulness (task-issue-20 FEAT-005)

- [x] Keep the spec-driven-dev artifacts and both READMEs truthful to the
      preserved `startTime`/`timeTbd` shared fields, the TBD-detection rule, the
      local-timezone Intl EN/JA display, the today/tomorrow + countdown section,
      and the client-side `.ics` download, without overstating (no new backend
      endpoint, no infra change).
      - `.kiro/specs/mlb-postseason/requirements.md`,
        `.kiro/specs/mlb-postseason/design.md`,
        `.kiro/specs/mlb-postseason/tasks.md`, `README.md`, `README.ja.md`.
- _Requirements: 16_

## Favorite teams: highlight, header pin, and filter (task-issue-18-favorites)

GitHub Issue #18 under `.agents/tasks/task-issue-18-favorites/` (features
FEAT-001 through FEAT-003): a frontend-only "favorite teams" feature. A pure,
guarded `localStorage` store (`mlb.favorites`, multiple ids), a
`FavoritesContext`/`useFavorites()` glue mounted in `main.tsx`, pure bracket
helpers, an accessible star toggle, a non-color-only series highlight, a header
pin, and a favorites-only filter with an empty state. All strings EN/JA. No
backend or infra change.

### F1. Favorites foundation: store, context, bracket helpers, i18n (task-issue-18 FEAT-001)

- [x] Pure guarded `localStorage` favorites store (key `mlb.favorites`, JSON int
      array, multiple allowed, corrupt values dropped, never throws) with pure
      `add`/`remove`/`toggle`/`isFavorite` helpers, mirroring `theme.ts`.
      - `frontend/src/favorites.ts`, `frontend/src/favorites.test.ts`.
- [x] `FavoritesProvider` + `useFavorites()` glue (hydrate, persist every change,
      throw outside the provider) mounted in `main.tsx` inside `I18nProvider`.
      - `frontend/src/FavoritesContext.tsx`,
        `frontend/src/FavoritesContext.test.tsx`, `frontend/src/main.tsx`.
- [x] Pure bracket helpers `findTeamSeries`/`isTeamEliminated`/`favoriteSummary`
      (+ exported `FavoriteSummary`) consistent with `computeStandings`, and all
      EN/JA `favorites.*` strings in the `MessageKey` union + both dictionaries
      (incl. `favorites.eliminated` `Eliminated`/`敗退`), with a dictionary
      parity test.
      - `frontend/src/bracketLayout.ts`, `frontend/src/bracketLayout.test.ts`,
        `frontend/src/i18n/messages.ts`, `frontend/src/i18n/index.test.ts`.
- _Requirements: 17_

### F2. Favorites UI: star toggle, highlight, header pin, filter (task-issue-18 FEAT-002)

- [x] Accessible star toggle (`FavoriteToggle`, native button, filled vs OUTLINE
      SVG star = shape not color, `aria-pressed`, localized `aria-label`) on
      `SeriesCard` team rows and `StandingsPanel` rows, preserving the Issue #22
      roving-tabindex keyboard model.
      - `frontend/src/components/FavoriteToggle.tsx`,
        `frontend/src/components/SeriesCard.tsx`,
        `frontend/src/components/StandingsPanel.tsx`,
        `frontend/src/components/FavoriteToggle.test.tsx`.
- [x] Non-color-only series highlight (`series-card--favorite` thick dashed
      theme-aware outline + star marker + visually-hidden `favorites.marker`
      label) and a localized `Eliminated`/`敗退` badge for an eliminated
      favorite; the header pin (`FavoritesPin`, renders nothing when no in-bracket
      favorite); the page-level favorites-only filter (survives season switches)
      with a localized empty state, filtering columns after `buildRoundColumns`
      while keeping the active-cell clamp intact.
      - `frontend/src/components/SeriesCard.tsx`,
        `frontend/src/components/FavoritesPin.tsx`,
        `frontend/src/pages/HomePage.tsx`,
        `frontend/src/components/BracketView.tsx`, `frontend/src/styles.css`,
        `frontend/src/components/SeriesCard.test.tsx`,
        `frontend/src/pages/HomePage.favorites.test.tsx`,
        `frontend/e2e/favorites.spec.ts`, `frontend/e2e/fixtures.ts`.
- _Requirements: 17_

### F3. Spec + README truthfulness (task-issue-18 FEAT-003)

- [x] Keep the spec-driven-dev artifacts and both READMEs truthful to the
      favorites store (`mlb.favorites`, multiple allowed, guarded parse), the
      non-color-only highlight (icon + border + a11y label), the
      `Eliminated`/`敗退` indication, the header pin, and the favorites-only
      filter + empty state, in EN and JA.
      - `.kiro/specs/mlb-postseason/requirements.md`,
        `.kiro/specs/mlb-postseason/design.md`,
        `.kiro/specs/mlb-postseason/tasks.md`, `README.md`, `README.ja.md`.
- _Requirements: 17_

## Series-flow visualization: charts + sparkline (task-issue-24-series-flow-charts)

GitHub Issue #24 under `.agents/tasks/task-issue-24-series-flow-charts/`
(features FEAT-001 through FEAT-003): a frontend-only series-flow visualization.
Pure chart-data helpers, detail-page inline-SVG charts with tabular
alternatives and a predictable-season probability overlay, and a bracket-card
score-diff sparkline. All strings EN/JA (default JA). The probability overlay
reuses the pure shared `predict()` via the shared `seriesProbTrend` truncation;
no Bedrock or live MLB call, no backend or infra change.

### F1. Pure chart-data helpers (task-issue-24 FEAT-001)

- [x] Dependency-free, React-free `seriesScoreDiffs`, `cumulativeWinTrend`, and
      `winProbTrend` with exact-number unit tests (sweep, close full-length, and
      null-score/in-progress fixtures).
      - `frontend/src/seriesCharts.ts`, `frontend/src/seriesCharts.test.ts`.
- [x] Additive shared `seriesProbTrend(series, bracket, accuracy)` that OWNS the
      per-game truncation (slice first k games, recompute high/low wins,
      `predict`); the private `sampleSeries` was refactored to delegate to it so
      the truncation lives in one place and `predict()` stays the single
      probability source. Existing backtest behavior/tests unchanged.
      - `shared/src/backtest.ts`, `shared/src/backtest.test.ts`.

### F2. Detail-page charts + tabular alternatives + probability overlay (task-issue-24 FEAT-002)

- [x] `SeriesFlowCharts` renders the run-difference bar chart, the cumulative
      win-trend chart, and (predictable season with games) the win-probability
      trend chart as inline SVGs, team-colored via `teamColor()`/
      `readableTextColor()`, each with `role="img"` + a REAL `<table>`
      alternative (collapsed behind a Show/Hide data-table toggle, winner as
      TEXT), wired via `aria-labelledby`/`aria-describedby`.
      - `frontend/src/components/SeriesFlowCharts.tsx`,
        `frontend/src/components/SeriesFlowCharts.test.tsx`,
        `frontend/src/pages/SeriesDetailPage.tsx`, `frontend/src/styles.css`.
- [x] New localized `flow.*` i18n keys (EN + JA, default JA) for the headings,
      chart titles, table captions/headers, winner phrasing, and the data-table
      toggle.
      - `frontend/src/i18n/messages.ts`.

### F3. Bracket-card sparkline + e2e + docs (task-issue-24 FEAT-003)

- [x] `ScoreDiffSparkline` (single `role="img"` SVG, `aria-hidden` children, NO
      focusable node, localized `flow.sparkline.label`) rendered in `SeriesCard`
      only when the series has games; subtle, theme-aware, `max-width:100%` so
      it does not overflow at 375px and does not regress the Issue #22 keyboard
      model or the Issue #18 favorite highlight.
      - `frontend/src/components/ScoreDiffSparkline.tsx`,
        `frontend/src/components/SeriesCard.tsx`, `frontend/src/styles.css`,
        `frontend/src/i18n/messages.ts`.
- [x] Component tests: the sparkline renders with `role="img"` + aria-label for
      a series with games and renders nothing for a games-less series; the card
      keeps its accessible label + keyboard affordances (no extra tab stop).
      - `frontend/src/components/SeriesCard.test.tsx`.
- [x] Playwright e2e: a 2024 seed detail renders the diff + trend charts + the
      tabular alternative and NO probability chart; a predictable 2026
      series-with-games renders the probability-trend chart + column; a bracket
      card shows the sparkline; a dark-mode detail screenshot is captured to the
      gitignored `test-results/`.
      - `frontend/e2e/series-flow.spec.ts`, `frontend/e2e/fixtures.ts`.
- [x] Full verification green (`npm run build`, `npm test`,
      `npm run test:e2e -w frontend`, `npm run synth`); keyboard/favorites/a11y
      e2e specs unregressed. Keep the spec-driven-dev artifacts and both READMEs
      truthful to the series-flow visualization.
      - `.kiro/specs/mlb-postseason/requirements.md`,
        `.kiro/specs/mlb-postseason/design.md`,
        `.kiro/specs/mlb-postseason/tasks.md`, `README.md`, `README.ja.md`.
- _Requirements: 18_

## Per-game detail: line score, pitchers, venue, highlights (task-issue-19-game-detail)

GitHub Issue #19 under `.agents/tasks/task-issue-19-game-detail/` (features
FEAT-002 through FEAT-005): a per-game detail accordion on the series detail
page, backed by a NEW `GET /game?gamePk=` endpoint. The backend assembles the
`GameDetailResponse` union from the MLB linescore + feed/live (and an optional
content recap) via pure parsers, caches it under `GAME#<gamePk>` with a
long-vs-short TTL by game state, and is served by a third Lambda with no Bedrock.

### D1. Backend: endpoint, pure parsers, GAME#<gamePk> cache (task-issue-19 FEAT-002)

- [x] Shared `GameDetailResponse` discriminated union (`status: 'ok' |
      'unavailable'`) plus `InningLine`, `LineScoreSide`, `LineScoreTotals`,
      `GamePitchers`, and `GameHighlight` in `@mlb/shared`.
      - `shared/src/types.ts`.
- [x] Pure parsers `parseLinescore`/`parseGameMeta`/`parseHighlight`/
      `buildGameDetail` tolerating missing fields with NO network/AWS access,
      plus thin response-narrowing MLB clients `fetchGameLinescore`
      (v1 linescore), `fetchGameFeedLive` (v1.1 feed/live), and best-effort
      `fetchGameContent` (v1 content).
      - `backend/src/mlb/gameDetail.ts`, `backend/src/mlb/client.ts`,
        `backend/src/mlb/gameDetail.test.ts`.
- [x] `BracketService.getGameDetail(gamePk)`: cache-first on `GAME#<gamePk>`,
      parallel linescore+feed-live fetch on a miss, best-effort content
      highlight, write-back with `GAME_DETAIL_FINAL_TTL_SECONDS` (1 week) for a
      completed game or `GAME_DETAIL_LIVE_TTL_SECONDS` (60s) otherwise, and the
      `{ status: 'unavailable', gamePk }` fallback (never thrown, never cached)
      on an upstream failure. New `getCachedGameDetail`/`putCachedGameDetail` on
      the store; `GET /game` handler with `parseGamePk` (400 on a non-positive
      integer).
      - `backend/src/service/bracketService.ts`, `backend/src/store/dynamo.ts`,
        `backend/src/handlers/getGameDetail.ts`, `backend/src/handlers/http.ts`,
        and their `*.test.ts`.

### D2. Infra: GetGameDetailFn Lambda + GET /game route (task-issue-19 FEAT-003)

- [x] A third Node 20 Lambda `GetGameDetailFn` bundled from
      `getGameDetail.ts`, carrying ONLY `TABLE_NAME` (NO `BEDROCK_MODEL_ID`),
      granted DynamoDB read/write but NO `bedrock:InvokeModel`, wired to a
      `GET /game` HTTP API route. Stack test asserts the env scope and the route.
      - `infra/lib/mlb-postseason-stack.ts`, `infra/test/stack.test.ts`.

### D3. Frontend: lazy per-game accordion + mobile scroll (task-issue-19 FEAT-004)

- [x] A per-game accordion on the series detail page that lazily calls
      `getGameDetail` on first expand, renders the inning R/H/E table, W/L/S
      pitchers, venue, and the optional highlights link, and keeps the final
      score visible on a fetch failure / `unavailable` response. The inning
      table is wrapped in a horizontally-scrollable `.detail__linescore-scroll`
      container so it does not break the 375px no-overflow guarantee. New
      `detail.game.*` i18n keys (EN + JA, default JA).
      - `frontend/src/pages/SeriesDetailPage.tsx`, `frontend/src/api.ts`,
        `frontend/src/i18n/messages.ts`, `frontend/src/styles.css`,
        `frontend/src/pages/SeriesDetailPage.test.tsx`,
        `frontend/e2e/game-detail-accordion.spec.ts`, `frontend/e2e/fixtures.ts`.

### D4. Spec + README truthfulness (task-issue-19 FEAT-005)

- [x] Keep the spec-driven-dev artifacts and both READMEs truthful to the
      game-detail endpoint, the `GameDetailResponse` contract, the
      `GAME#<gamePk>` cache with TTL-by-state, the three-Lambda / three-route
      infra, and the mobile horizontal-scroll accordion. Verification was a
      read-through cross-checking the docs against
      `backend/src/handlers/getGameDetail.ts`, `backend/src/store/dynamo.ts`,
      `backend/src/mlb/gameDetail.ts`, and `infra/lib/mlb-postseason-stack.ts`,
      plus a `npm run build` sanity check.
      - `.kiro/specs/mlb-postseason/requirements.md`,
        `.kiro/specs/mlb-postseason/design.md`,
        `.kiro/specs/mlb-postseason/tasks.md`, `README.md`, `README.ja.md`.
- _Requirements: 19_
