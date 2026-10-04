# 実証された教訓 / Demonstrated Lessons

This is the judge-facing summary for the Kiro University final exam. It explains
HOW each of the seven required lessons (plus the two bonuses) is demonstrated in
this repository, with links to the real files. Every path below exists in the
repo.

Project: **MLB Postseason Summary Site** - a serverless, full-stack TypeScript
app (React/Vite SPA on S3 + CloudFront; API Gateway HTTP API + two Node 20
Lambdas; DynamoDB cache; Amazon Bedrock narrative with deterministic fallback;
AWS CDK). See the root [README.md](./README.md) for the full architecture.

---

## 1. 仕様主導型開発 / Spec-driven development

Kiro specs drive the build. The spec set describes the ACTUAL implemented
system, not a hypothetical one.

- Requirements (EARS-style user stories + WHEN/THEN acceptance criteria for the
  bracket view, prediction, Bedrock narrative + fallback, data strategy, and
  one-command deploy):
  [.kiro/specs/mlb-postseason/requirements.md](./.kiro/specs/mlb-postseason/requirements.md)
- Design (architecture + the real `bracketService` resolution order,
  `aggregateBracket`, `predict`, `generateNarrative`, handlers, CDK stack):
  [.kiro/specs/mlb-postseason/design.md](./.kiro/specs/mlb-postseason/design.md)
- Tasks (breakdown mapped to the real FEAT-001..FEAT-007 work and the files that
  implement each): [.kiro/specs/mlb-postseason/tasks.md](./.kiro/specs/mlb-postseason/tasks.md)

The specs trace to real modules such as
[backend/src/service/bracketService.ts](./backend/src/service/bracketService.ts),
[backend/src/mlb/aggregate.ts](./backend/src/mlb/aggregate.ts), and
[backend/src/predict/model.ts](./backend/src/predict/model.ts).

---

## 2. 運営文書 / Steering docs

Always-on steering files shape every change in the repo.

- [.kiro/steering/kiro-university.md](./.kiro/steering/kiro-university.md) - the
  challenge requirements.
- [.kiro/steering/product.md](./.kiro/steering/product.md) - product scope.
- [.kiro/steering/tech.md](./.kiro/steering/tech.md) - stack + conventions.
- [.kiro/steering/structure.md](./.kiro/steering/structure.md) - repo layout.
- [.kiro/steering/testing.md](./.kiro/steering/testing.md) - the unit +
  property-based + Playwright e2e testing conventions (added for this lesson).

All are `inclusion: always`, so Kiro reads them on every task.

---

## 3. フック / Hooks (Agent Hooks)

Agent hooks in Kiro's `*.kiro.hook` JSON format automate the inner loop.

- [.kiro/hooks/run-tests-on-save.kiro.hook](./.kiro/hooks/run-tests-on-save.kiro.hook)
  - runs the backend unit + property tests when any `backend/**` or `shared/**`
  source is saved.
- [.kiro/hooks/typecheck-on-save.kiro.hook](./.kiro/hooks/typecheck-on-save.kiro.hook)
  - runs `npm run typecheck` across workspaces on any `.ts`/`.tsx` save.
- [.kiro/hooks/run-e2e-suite.kiro.hook](./.kiro/hooks/run-e2e-suite.kiro.hook) -
  a manual hook that runs the Playwright e2e suite (disabled by default).

Each is valid JSON using the `enabled / name / description / version / when /
then` shape.

---

## 4. プロパティベーステスト（IDEのみ）/ Property-based testing (IDE-only)

[fast-check](https://github.com/dubzzz/fast-check) property tests exercise the
REAL functions and run under `npm test -w @mlb/backend`.

- [backend/src/predict/model.property.test.ts](./backend/src/predict/model.property.test.ts)
  - generates random valid series (two distinct team ids, wins within the clinch
  count, best-of in {3,5,7}, random win-pct map) and asserts
  `favoriteWinProbability ∈ [0.5, 0.95]` and `favoriteTeamId` is one of the two
  teams.
- [backend/src/mlb/aggregate.property.test.ts](./backend/src/mlb/aggregate.property.test.ts)
  - generates random valid raw-game arrays and asserts each series'
  `high.wins`/`low.wins` never exceed `bestOf`, `status` is
  `scheduled | in_progress | final`, `league` is `AL | NL | WS`, and `round` is
  one of the four `RoundName` values.

fast-check is pinned as a backend devDependency in
[backend/package.json](./backend/package.json).

---

## 5. パワー / Powers (Kiro Powers)

Kiro Powers were used during the build and one is packaged in the repo (see also
BONUS B below).

- Powers used: the **agent-browser / Playwright** power for the e2e UI tests in
  [frontend/e2e/](./frontend/e2e/)
  ([home.spec.ts](./frontend/e2e/home.spec.ts),
  [prediction.spec.ts](./frontend/e2e/prediction.spec.ts)), and the
  **github-cli** power for repository, PR, and issue workflows (the tracked
  issue registry is [ISSUES.md](./ISSUES.md)).
- Packaged power (BONUS B): [powers/mlb-postseason/](./powers/mlb-postseason/) -
  a self-contained power with a manifest
  ([power.json](./powers/mlb-postseason/power.json)), bundled steering
  ([steering/mlb-stats-api.md](./powers/mlb-postseason/steering/mlb-stats-api.md)),
  a skill
  ([skills/aggregate-bracket.md](./powers/mlb-postseason/skills/aggregate-bracket.md)),
  an `mlb-fetch` MCP server, and a
  [README](./powers/mlb-postseason/README.md).

---

## 6. モデルコンテキストプロトコル（MCP）/ Model Context Protocol

MCP servers relevant to the project are configured in Kiro's MCP schema.

- [.kiro/settings/mcp.json](./.kiro/settings/mcp.json) configures:
  - **aws-docs** (`uvx awslabs.aws-documentation-mcp-server@latest`) - consult
    AWS docs for CDK, Lambda, DynamoDB, and Bedrock while building.
  - **fetch** (`uvx mcp-server-fetch`) - fetch the public MLB Stats API and
    other docs.

No secrets are embedded; both servers are public and installable via `uvx`.

---

## 7. 通関業者 / Custom Agents

A project-specific custom agent encodes the stack and conventions.

- [.kiro/agents/mlb-postseason-dev.json](./.kiro/agents/mlb-postseason-dev.json)
  defines the `mlb-postseason-dev` agent: a system prompt covering the npm
  workspaces monorepo, strict TypeScript/ESM, test-first conventions, the real
  `getBracket`/`getPrediction` resolution order, the clamped prediction
  probability, the Bedrock fallback, and one-command CDK deploy, plus its
  allowed tools and the steering/spec context it loads.

---

## 【ボーナス】Kiro Web / クラウドセッション / クラウド構成 / Bonus A - Kiro Web, cloud sessions, cloud configuration

- [docs/kiro-web-cloud.md](./docs/kiro-web-cloud.md) explains how the project was
  built on Kiro Web using cloud sessions, the local-vs-cloud engineering
  differences to show in the demo video, and how AWS cloud configuration /
  credentials activate in a fresh session to run `cdk bootstrap` + `cdk deploy`
  via the one-command deploy flow documented in [README.md](./README.md).

---

## 【ボーナス】キロパワーをパッケージ化 / Bonus B - Package a Kiro Power

- [powers/mlb-postseason/](./powers/mlb-postseason/) is a self-contained,
  documented, installable Kiro Power (manifest + bundled steering + skill + MCP
  server + README). It lives outside the npm workspaces as a non-built asset, so
  it does not affect the root build.

---

## Verification

From the repo root, all of the following pass:

- `npm run build`
- `npm test` (backend unit + fast-check property tests, frontend, infra)
- `npm run synth`

Every `.kiro` JSON artifact (each `.kiro/hooks/*.kiro.hook`,
`.kiro/settings/mcp.json`, and `.kiro/agents/mlb-postseason-dev.json`) parses as
valid JSON.
