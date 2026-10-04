# MLB Postseason Summary Site

A lightweight, serverless web app that gives a **graphical summary of the MLB postseason**
plus an **AI-powered win/loss prediction** for any series. Built end to end in TypeScript
and deployed to AWS with one command via AWS CDK.

This project is a submission for the [Kiro University Challenge](https://kiro.dev/2026/university/)
final exam.

> **Judges:** see [DEMONSTRATED_LESSONS.md](./DEMONSTRATED_LESSONS.md) (実証された教訓)
> for how each of the seven required lessons and the two bonuses is demonstrated,
> with links to the relevant files.

---

## Overview

- **Multiple seasons with a season selector** — the app is year-aware. The current year
  is **2026** and the selector offers **2024, 2025, and 2026** (default 2026). Past
  seasons (2024, 2025) are **results-only**; the current season (2026) is the live,
  in-progress one.
- **Graphical postseason view** — a bracket from the Wild Card round through the World
  Series, showing each series, both teams, the series score, and status.
- **Series detail** — per-series, game-by-game results (available for every season).
- **Standings / summary panel** — participating teams grouped by league with their
  postseason progress.
- **Win/loss prediction (added feature, current season only)** — for a series in the
  in-progress season, the app shows a favorite, a win probability, and an **AI-generated
  narrative** explaining the pick. The prediction feature is offered **only for the
  current (in-progress) season**; completed seasons simply show their final results.

The numeric win probability is produced by a deterministic model in code (so it is
explainable and unit-tested); **Amazon Bedrock** (Anthropic Claude) turns it into prose.

No authentication. Public, read-only. Not a betting product.

---

## Architecture

```
                      ┌──────────────────────────────┐
   Browser  ──────▶   │  CloudFront (HTTPS, SPA)      │
                      │   └─ S3 (private, OAC)        │  static React/Vite bundle
                      └──────────────┬───────────────┘
                                     │  /config.js injects window.__API_BASE_URL__
                                     ▼
                      ┌──────────────────────────────┐
   fetch /bracket ──▶ │  API Gateway (HTTP API, CORS)│
   fetch /prediction  └──────┬───────────────┬───────┘
                             ▼               ▼
                  ┌───────────────┐  ┌────────────────────┐
                  │ getBracket λ  │  │ getPrediction λ     │
                  │ (Node 20)     │  │ (Node 20, Bedrock)  │
                  └───┬───────────┘  └───┬────────────┬────┘
                      │                  │            │
                      ▼                  ▼            ▼
             ┌─────────────────┐  ┌───────────┐  ┌──────────────────┐
             │ DynamoDB cache  │  │ MLB Stats │  │ Amazon Bedrock    │
             │ (pk, TTL ttl)   │  │ API       │  │ (Anthropic Claude)│
             └─────────────────┘  └───────────┘  └──────────────────┘
```

- **Frontend:** React + TypeScript (Vite), hosted on **S3** (private, Origin Access
  Control) and served through **CloudFront**.
- **Backend:** two **AWS Lambda** functions (Node 20) behind an **API Gateway HTTP API**
  with CORS. Routes: `GET /bracket`, `GET /prediction`, `POST /prediction`.
- **Data:** **DynamoDB** caches the aggregated bracket JSON per season.
- **AI:** **Amazon Bedrock** (`InvokeModel`) generates the prediction narrative.
- **IaC:** **AWS CDK (TypeScript)** provisions everything for one-command deploy.

### Monorepo layout (npm workspaces)

| Workspace       | Package         | Purpose                                             |
| --------------- | --------------- | --------------------------------------------------- |
| `shared/`       | `@mlb/shared`   | Domain types (`Bracket`, `Series`, `PredictionResponse`), `TEAMS`, the season config (`CURRENT_YEAR`, `SELECTABLE_SEASONS`, `seasonMode`), and the bundled 2024 + 2025 seed datasets. |
| `backend/`      | `@mlb/backend`  | Lambda handlers, MLB client + aggregation, prediction model, Bedrock narrative. |
| `frontend/`     | `@mlb/frontend` | React + Vite SPA (bracket, standings, prediction panel) with committed SVG image assets. |
| `infra/`        | `@mlb/infra`    | AWS CDK app (S3 + CloudFront, HTTP API + Lambda, DynamoDB, Bedrock IAM). |

---

## MLB data strategy

1. **DynamoDB cache first.** `getBracket` looks up `pk = BRACKET#<season>` in DynamoDB.
   A fresh cached bracket (TTL on the `ttl` attribute, ~15 min) is returned directly.
2. **MLB Stats API on cache miss.** The Lambda fetches the public MLB Stats API
   (`https://statsapi.mlb.com/api/v1/schedule/postseason?sportId=1&season=YYYY`, no API
   key), aggregates games into series, and writes the result back to the cache.
3. **Seed fallback (completed seasons).** If the live API is unreachable, the bundled
   `@mlb/shared` seed datasets are used so the app stays deterministic in tests and demos.
   The fallback now covers **both 2024 and 2025**:
   - `postseason-2024.json` — Dodgers defeated Yankees 4-1.
   - `postseason-2025.json` — Dodgers defeated Blue Jays 4-3 (real results aggregated from
     the live MLB Stats API).

   The frontend also falls back to these seeds if the bracket request fails, so the demo
   renders offline.
4. **2026 is the live / current season.** The current year (2026) has no bundled seed and
   is fetched live. The app gracefully handles an empty or not-yet-started 2026 postseason
   (showing a "has not started yet" message instead of a broken bracket), and aggregation
   tolerates the placeholder teams the live schedule returns for not-yet-determined rounds.

### Seasons and the prediction feature

The season selector offers 2024, 2025, and 2026 (default 2026). A season strictly before
the current year is **results-only**: the prediction UI is hidden and the `/prediction`
endpoint returns a results-only response (`mode: 'results'`) instead of a numeric
prediction. The current season (2026) is **predictable**, so the prediction feature is
offered for its in-progress series; `/prediction` returns `mode: 'prediction'` for a
started series or `mode: 'upcoming'` when a series has not started yet. All variants are
returned with HTTP 200 and the frontend branches on `mode`.

### Finished series: prediction turned OFF

Even within the current, predictable season, a series that has already finished
(`status === 'final'`) shows its **final result, never a speculative prediction**. This is
enforced on both tiers:

- **Backend:** `/prediction` resolves the series and, if it is `final`, returns
  `mode: 'results'` **without** running the prediction model or invoking Bedrock.
- **Frontend:** a finished series card does **not** render the "Predict winner" button and
  surfaces a **"View series detail"** link instead, so no numeric win probability is ever
  shown for a completed series.

### Configurable prediction accuracy

The prediction panel exposes a labeled **accuracy** slider that tunes how confident the
model is. `accuracy` is a sharpness control in the range **`[0, 1]`** with a **default of
`0.5`**:

- `0.5` (default) is an **identity** transform — the historical model behavior, unchanged.
- **Higher** accuracy (> 0.5) sharpens the pick toward the favorite (more confident, up
  toward `0.95`).
- **Lower** accuracy (< 0.5) softens it toward a coin flip (`0` collapses the favorite to
  exactly `0.5`).

The win probability **always stays within `[0.5, 0.95]`** for any accuracy value (an
invariant covered by property tests). The control is threaded end to end: the slider
appends an **`&accuracy=<value>`** query parameter to `GET /prediction` (also accepted in
the `POST /prediction` body), e.g.
`GET /prediction?seriesId=...&season=2026&accuracy=0.8`. A missing or invalid `accuracy`
falls back to the default and never causes a `400`. Dragging the slider debounces and
re-requests the prediction, updating the favorite, probability, and narrative live.

### Japanese / English language switch

The UI ships a **JA/EN language toggle** in the header. **Japanese is the default**; the
choice is persisted to `localStorage` (key `mlb.lang`) and restored on reload. All
user-facing strings are localized (title/subtitle, season label, statuses, round names,
legend, standings, the prediction panel including the accuracy control, the game-detail
toggle, and the detail page). Unknown/preview team ids (not in the `TEAMS` map) render a
localized placeholder — EN `TBD (#<id>)`, JA `未定 (#<id>)` — rather than a raw
`Team <id>`.

### Game-detail toggle and the finished-series detail page

- **Collapsed-by-default game detail.** Each series card hides its game-by-game list
  behind a per-series **Show games / Hide games** toggle that starts collapsed. This keeps
  the bracket compact and is the primary fix for the previously uneven ("gatagata") card
  heights and column alignment.
- **Finished-series detail page + client-side routing.** The SPA uses path-based
  (history) client-side routing (`react-router-dom`). A finished series links to a
  dedicated detail page at `/season/:season/series/:seriesId` showing the full
  game-by-game result; an unknown id shows a friendly "Series not found" page. Path-based
  deep links work in production because CloudFront rewrites `403`/`404` responses to
  `/index.html` (HTTP 200), so the SPA shell loads and renders the requested route.

## Amazon Bedrock usage

The win probability is computed by a transparent heuristic in `backend/src/predict/`
(current series progress blended with regular-season win pct, clamped to `[0.5, 0.95]`).
**Bedrock** (`BEDROCK_MODEL_ID`, default `us.anthropic.claude-haiku-4-5-20251001-v1:0`,
a cross-region inference profile) is then
asked to explain the pick in a concise 2–3 sentence narrative. If Bedrock errors, the
endpoint degrades gracefully to a deterministic templated narrative, so a prediction is
always returned.

## Image assets

The UI uses **real, committed SVG image assets** (not emoji) under
`frontend/src/assets/` — a brand logo, a baseball/diamond hero, league/World Series marks,
plus generated team-color SVG badges driven by per-team colors. SVGs keep the repo light
while satisfying the "actual image assets" requirement.

---

## Prerequisites

- **Node.js 20+** (the local toolchain may be Node 22; code targets the Node 20 Lambda
  runtime).
- **An AWS account** with credentials active in your shell/session (profile, SSO, or
  environment variables).
- **Amazon Bedrock model access granted** for the chosen Claude model
  (`us.anthropic.claude-haiku-4-5-20251001-v1:0` by default, a cross-region inference
  profile) **in the deploy region**. Enable model access in the Bedrock console before
  deploying. The default is an inference-profile id (prefix `us.`) because the current-
  generation Claude Haiku model is only invocable on-demand through an inference profile;
  the Lambda's IAM policy grants `bedrock:InvokeModel` on the inference profile plus the
  underlying foundation models across US regions it may route to. Override the model with
  `cdk deploy --context bedrockModelId=<id>`.
- The CDK bundles Lambdas with **esbuild** (no Docker required).

> **Note:** AWS credentials must be active **and** Bedrock model access must be granted
> in the region before you deploy. The repository build itself performs no live AWS or
> Bedrock calls.

---

## One-command deploy

From the repo root, with active AWS credentials:

```bash
npm install && npm run build && npm run deploy
```

- `npm install` — installs all workspaces.
- `npm run build` — builds in dependency order: `shared → backend → frontend → infra`.
  The frontend must be built **before** deploy because CDK packages `frontend/dist` as the
  S3 website source at synth time.
- `npm run deploy` — re-runs the ordered build, then `cdk deploy` for the `@mlb/infra`
  workspace.

### First-time setup (CDK bootstrap)

If this is the first CDK deploy into the target account/region, bootstrap once:

```bash
cd infra
npx cdk bootstrap
npx cdk deploy
```

(From the repo root you can also run `npm run bootstrap` then `npm run deploy`.)

After deploy, the stack prints outputs:

- **ApiUrl** — the HTTP API base URL.
- **DistributionDomainName** — the CloudFront domain to open in a browser.
- **BucketName** — the S3 bucket hosting the SPA.
- **TableName** — the DynamoDB cache table.

### How the SPA finds the API (no rebuild needed)

The same static bundle is pointed at any deployed API at **deploy time**: CDK writes a
`/config.js` at the bucket root containing
`window.__API_BASE_URL__ = "<ApiUrl>";`, loaded by `index.html` before the app bundle.
At runtime the SPA reads `window.__API_BASE_URL__`, falling back to the build-time
`VITE_API_BASE_URL` and finally to a local default.

### Verify without deploying

To validate the CloudFormation template without touching AWS:

```bash
npm run build        # ensures frontend/dist exists for the SPA asset
npm run synth        # cdk synth -> infra/cdk.out (no AWS calls)
```

---

## Local development

```bash
npm install
npm run dev -w frontend     # Vite dev server (http://localhost:5173)
```

By default the frontend targets `http://localhost:3000` for the API. Options for data:

- **Offline / seed data:** if the bracket request fails, the SPA automatically falls back
  to the bundled `@mlb/shared` seeds (2024 and 2025), so the completed-season brackets
  render without a backend.
- **Point at a deployed API:** build with `VITE_API_BASE_URL=<ApiUrl> npm run build -w frontend`,
  or set `window.__API_BASE_URL__` via `/config.js` (as the deployed site does).

Run the test suites and typecheck across the monorepo:

```bash
npm test          # Vitest across workspaces (AWS SDK + MLB API mocked)
npm run typecheck # strict TypeScript across all workspaces
```

---

## How steering files map to Kiro University lessons

The steering set under `.kiro/steering/` drives the build and demonstrates the exam's
required lessons:

| Steering file                 | What it drives                                              | Kiro University lesson theme |
| ----------------------------- | ----------------------------------------------------------- | ---------------------------- |
| `kiro-university.md`          | Challenge rules, scoring, and how the build maps to lessons | Spec/steering-driven development |
| `product.md`                  | Product vision, features, constraints, non-goals            | Requirements → spec quality  |
| `tech.md`                     | Approved AWS architecture and TypeScript toolchain          | Infrastructure as Code (CDK) + AWS integration |
| `structure.md`                | Monorepo layout and conventions                             | Project structure / maintainability |

Concretely, the lessons are demonstrated by:

- **Spec / steering-driven development** — this steering set plus discrete planned
  features under `.agents/tasks/`.
- **Amazon Bedrock integration** — the win/loss prediction narrative is a real AI
  integration, not a toy.
- **Infrastructure as Code** — AWS CDK provisions the entire stack for one-command deploy.
- **Testing** — Vitest unit tests cover prediction logic and MLB aggregation with AWS and
  the MLB API mocked (no live calls in CI).
- **Documentation** — this README covers one-command deploy and local development.

---

## License

Illustrative project for the Kiro University Challenge. Not affiliated with MLB. The MLB
Stats API is used under its public terms; predictions are illustrative, not betting advice.
