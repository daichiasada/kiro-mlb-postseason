# Issue Registry

Tracked registry of issues surfaced by the review -> issue -> fix loop for the
MLB Postseason summary site. Each issue has a stable id, a severity, the review
round / tool that found it, a description, a status, and the files that resolve
it. The orchestrator files these as GitHub Issues; the code resolutions below
are already committed to this repo.

Status legend:

- **Fixed** - resolved in code with tests/synth proving it.
- **Won't fix here (justified)** - cannot be resolved in this offline
  environment; a written justification and the residual action are recorded.

| ID | Title | Severity | Source | Status |
| --- | --- | --- | --- | --- |
| ISSUE-1 | Series-ID contract across the seed/live boundary | High | v1 semantic review (`2026-10-04-150850-review.md`) | Fixed |
| ISSUE-2 | Bedrock request/response path only mock-tested | Medium | v1 semantic review | Fixed (request/response shaping) + Won't fix here (live smoke test) |
| ISSUE-3 | `infra/` has no assertion tests | Medium | v1 semantic review | Fixed |
| ISSUE-4 | BucketDeployment prune can transiently remove `/config.js` | Medium | v1 semantic review | Fixed |
| ISSUE-5 | Bracket overflows the viewport horizontally on narrow screens | Low | FEAT-005 Playwright e2e run | Fixed (in FEAT-005) |
| ISSUE-6 | Stale `kiro-university.md` steering frames shipped lessons as future work | Low | v3 semantic review (`2026-10-04-154930-review.md`) | Fixed |
| ISSUE-7 | FEAT labels in `tasks.md` disagree with the feature registry | Low | v3 semantic review (`2026-10-04-154930-review.md`) | Fixed |
| ISSUE-8 | Aggregate property test used the loose `wins <= bestOf` bound | Low | v3 semantic review (`2026-10-04-154930-review.md`) | Fixed |

---

## ISSUE-1 - Series-ID contract across the seed/live boundary

- **Severity:** High
- **Source:** v1 semantic review, issue 1.
- **Status:** Fixed

**Description.** The SPA requests a prediction by a series id that may have
originated from the bundled seed, while the backend may derive ids from live MLB
data. Series ids are built as
`${season}-${league}-${roundslug}-${highId}-${lowId}`, where the high/low seed
is the game-1 home team. If the seed's high/low assignment disagrees with the
live aggregation for the same matchup, the exact-string lookup in
`BracketService.getPrediction` 404s on an otherwise valid click.

**Resolution.** `getPrediction` now resolves the series through a new
`resolveSeries` helper: it tries an exact id match first, and on a miss parses
the requested id into `{season, league, round-slug, idA, idB}` and matches a
series by round slug plus the **unordered** `{high.teamId, low.teamId}` pair.
A genuinely unknown series (bad pair) still throws `SeriesNotFoundError`, so the
404 contract is preserved for real misses only.

**Resolving files.**

- `backend/src/service/bracketService.ts` - `parseSeriesId`, `roundSlugOf`,
  `resolveSeries`; `getPrediction` now calls `resolveSeries`.
- `backend/src/service/bracketService.test.ts` - asserts a swapped high/low id
  (`2024-al-wildcard-116-117`) resolves the stored `2024-al-wildcard-117-116`
  series, and that an unknown team pair still throws `SeriesNotFoundError`.

**Verification.** `npm test -w backend` (series-id-swap case passes).

---

## ISSUE-2 - Bedrock request/response path only mock-tested

- **Severity:** Medium
- **Source:** v1 semantic review, issue 2.
- **Status:** Fixed (request/response shaping) + Won't fix here (live smoke test)

**Description.** `RealBedrockInvoker.invoke` builds an Anthropic `messages`
InvokeModel body and parses `content[].text` from the response, but that exact
shaping was only exercised through a higher-level mock of `invoke`. A wrong body
shape or an SDK response change would surface only at deploy time.

**Resolution (code).** Added focused unit tests that construct
`RealBedrockInvoker` with an injected `BedrockRuntimeClient` whose `send()` is
stubbed to return a realistic Anthropic response body (no live AWS call). The
tests assert (a) the request body shape sent to `InvokeModelCommand`
(`anthropic_version`, `max_tokens`, `temperature`, `messages[].role/content`)
and the command's `modelId`/`contentType`/`accept`, and (b) that `content[].text`
is parsed and concatenated correctly, including the no-text error path.
`RealBedrockInvoker` already accepted an injectable client
(`constructor(client?: BedrockRuntimeClient)`), so no production refactor was
needed.

**Won't fix here (justified).** The remaining risk - that the live Bedrock
endpoint accepts this body and the deployed region/model grants access - cannot
be verified in this environment: AWS credentials are not active and no live
Bedrock call is permitted. This is a **post-deploy smoke test**, documented
below, to be run once after `cdk deploy` in an account with Bedrock model access:

1. `curl -s "$API_URL/prediction?seriesId=2024-ws-worldseries-119-147&season=2024"`
2. Confirm HTTP 200 and a JSON `Prediction` with a non-empty `narrative`.
3. Confirm `model` does **not** end with ` (fallback)` - a `(fallback)` suffix
   means the Bedrock call failed and the deterministic template was used, which
   indicates a model-access/region/body problem to investigate.

**Resolving files.**

- `backend/src/bedrock/narrative.test.ts` - `RealBedrockInvoker request/response
  shaping (ISSUE-2)` describe block.
- `backend/src/bedrock/narrative.ts` - already client-injectable (unchanged).

**Verification.** `npm test -w backend`.

---

## ISSUE-3 - `infra/` has no assertion tests

- **Severity:** Medium
- **Source:** v1 semantic review, issue 3.
- **Status:** Fixed

**Description.** The CDK stack was validated only by `cdk synth`; IAM scoping,
runtimes, routes, SPA error responses and the bucket deployment had no assertion
guarding regressions.

**Resolution.** Added `infra/test/stack.test.ts` using
`aws-cdk-lib/assertions` `Template.fromStack`. It synthesizes the stack
in-process with a fixed `env` (`account:123456789012`, `region:us-east-1`) so no
ambient AWS credential is read and no live call is made, then asserts:

- DynamoDB table with `TimeToLiveSpecification` Enabled on `ttl` and a `pk`
  `HASH` key.
- Two `nodejs20.x` application Lambda functions, each with `TABLE_NAME` and
  `BEDROCK_MODEL_ID` environment variables (asserted by matching properties,
  because CDK also synthesizes helper Lambdas).
- An IAM policy allowing `bedrock:InvokeModel`.
- HTTP API routes `GET /bracket`, `GET /prediction`, `POST /prediction`.
- CloudFront `CustomErrorResponses` mapping 403 and 404 to `/index.html`.
- Exactly one `Custom::CDKBucketDeployment` (see ISSUE-4).

The infra workspace already had `vitest` as a devDependency and a
`test` script (`vitest run --passWithNoTests`); the test runs under vitest's
node/esm transform, which handles the TS stack and the stack's `import.meta.url`
without a config change.

**Resolving files.**

- `infra/test/stack.test.ts` (new).
- `infra/tsconfig.json` - `include` extended to `test/**/*.ts`.

**Verification.** `npm test -w infra` (6 assertions pass, no live AWS call).

---

## ISSUE-4 - BucketDeployment prune can transiently remove `/config.js`

- **Severity:** Medium
- **Source:** v1 semantic review, issue 4.
- **Status:** Fixed

**Description.** The previous design used two `BucketDeployment`s: the SPA
deployment pruned by default while a separate `DeployRuntimeConfig` used
`prune:false` to write `/config.js`. On a redeploy the SPA deployment's prune
step could transiently delete the existing `/config.js` before the second
deployment rewrote it, so a request landing in that window would 404 on the
runtime config.

**Resolution.** The SPA asset and the deploy-time `/config.js` are now shipped by
a **single** `BucketDeployment` (`DeploySpa`) whose `sources` array combines
`Source.asset(frontend/dist)` and `Source.data('config.js', ...)`. With one
deployment, prune is internally consistent: `/config.js` is part of the same
managed object set as the SPA and is never pruned away, so it is always present
after each deploy. `apiUrl` is a deploy-time token and `Source.data` resolves it
when the asset is rendered. The chosen approach is documented in a code comment
in the stack, and the separate `DeployRuntimeConfig` deployment was removed.

**Resolving files.**

- `infra/lib/mlb-postseason-stack.ts` - single `DeploySpa` BucketDeployment with
  the combined sources + explanatory comment.
- `infra/test/stack.test.ts` - asserts exactly one `Custom::CDKBucketDeployment`.

**Verification.** `npm run synth` builds the template and it still contains the
`/config.js` content; `npm test -w infra` asserts the single-deployment count.

---

## ISSUE-5 - Bracket overflows the viewport horizontally on narrow screens

- **Severity:** Low
- **Source:** FEAT-005 Playwright e2e run (`frontend/e2e/home.spec.ts` narrow-width guard).
- **Status:** Fixed (in FEAT-005)

**Description.** At a 375px (phone) viewport the bracket kept a two-column grid
(the `<=860px` rule) wider than the screen, producing ~36px of horizontal
overflow with the Division Series column clipped off-screen, confirmed by a
Playwright failure screenshot.

**Resolution.** Fixed within FEAT-005: `frontend/src/styles.css` gained a
`<=560px` media query that collapses `.bracket__grid` to a single column, stacks
the header, makes the hero full-width, and lets long team names wrap
(`overflow-wrap: anywhere; min-width: 0`). The e2e overflow guard then reports 0
horizontal overflow.

**Resolving files.**

- `frontend/src/styles.css` (committed in FEAT-005, commit
  `fix(frontend): prevent bracket horizontal overflow on narrow screens`).
- `frontend/e2e/home.spec.ts` - narrow-width overflow assertion.

**Verification.** `npm run test:e2e -w frontend` (narrow-width guard passes).

---

## ISSUE-6 - Stale `kiro-university.md` steering frames shipped lessons as future work

- **Severity:** Low
- **Source:** v3 semantic review (`2026-10-04-154930-review.md`), issue 1.
- **Status:** Fixed

**Description.** `.kiro/steering/kiro-university.md` is `inclusion: always`, so it
is read on every task and by any judge who opens it. It was written early in the
build and still framed hooks, MCP, powers, custom agents, and property-based
testing as "potential" / "can be added" future work. Its "How this project
demonstrates the lessons" section listed only spec/steering, Bedrock, IaC,
testing, and docs, omitting the now-shipped hooks, MCP config, packaged power,
custom agent, and property tests. This undersold the completed submission
relative to the authoritative `DEMONSTRATED_LESSONS.md`.

**Resolution.** Rewrote the "How this project demonstrates the lessons" section
in past/present tense and enumerated all seven required lessons plus the two
bonuses, each with a short pointer to the real artifact path (aligned with
`DEMONSTRATED_LESSONS.md`): `.kiro/specs/`, `.kiro/steering/`, `.kiro/hooks/`,
the backend property tests, `powers/mlb-postseason/`, `.kiro/settings/mcp.json`,
`.kiro/agents/mlb-postseason-dev.json`, and `docs/kiro-web-cloud.md`. The
existing factual challenge-shape and scoring content is unchanged.

**Resolving files.**

- `.kiro/steering/kiro-university.md` - rewritten lessons section.

**Verification.** The file no longer calls the shipped lessons "potential" and
every path it references exists in the repo.

---

## ISSUE-7 - FEAT labels in `tasks.md` disagree with the feature registry

- **Severity:** Low
- **Source:** v3 semantic review (`2026-10-04-154930-review.md`), issue 2.
- **Status:** Fixed

**Description.** `.kiro/specs/mlb-postseason/tasks.md` had two sections both
labeled FEAT-005 and attributed the CDK infrastructure to FEAT-006, which
disagreed with the real feature registry under
`.agents/tasks/task-mlb-postseason-site/features/` (FEAT-001 scaffold + steering,
FEAT-002 backend, FEAT-003 frontend, FEAT-004 CDK infra + README, FEAT-005
Playwright e2e + UI fix, FEAT-006 ISSUES.md + issue resolutions, FEAT-007 lesson
artifacts). The mismatch was cosmetic but reduced internal consistency.

**Resolution.** Relabeled the `tasks.md` sections so the FEAT numbers match the
registry: backend sections (MLB data layer, prediction model, Bedrock narrative,
service/handlers/store) are FEAT-002; the frontend SPA is FEAT-003; the
Playwright e2e + narrow-screen UI fix is FEAT-005; the CDK stack + README is
FEAT-004; the issue registry is FEAT-006; and the lesson artifacts remain
FEAT-007.

**Resolving files.**

- `.kiro/specs/mlb-postseason/tasks.md` - relabeled sections.

**Verification.** Each section's FEAT number now matches the feature registry.

---

## ISSUE-8 - Aggregate property test used the loose `wins <= bestOf` bound

- **Severity:** Low
- **Source:** v3 semantic review (`2026-10-04-154930-review.md`), issue 3.
- **Status:** Fixed

**Description.** `backend/src/mlb/aggregate.property.test.ts` asserted each
series' `high.wins`/`low.wins` satisfy `wins <= bestOf`. The tighter real
contract is the clinch bound `wins <= Math.ceil(bestOf / 2)` - a team stops
playing once it clinches, so it can never win more than the clinch count. The
loose assertion would not catch an over-count between clinch + 1 and bestOf.

**Resolution.** Tightened the assertion to `wins <= Math.ceil(bestOf / 2)` and
reworked the generator so the invariant is both tight and true: instead of
flipping each game's winner independently (which could let one team win up to
`gamesInSeries` games), the generator now draws win counts directly, capping the
winner at the clinch count and the loser at `clinch - 1`, then emits games with
explicit winners. The property still holds and passes.

**Resolving files.**

- `backend/src/mlb/aggregate.property.test.ts` - tightened assertion + capped
  generator.

**Verification.** `npm test -w @mlb/backend` (the tightened property suite
passes).
