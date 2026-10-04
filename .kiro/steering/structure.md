---
inclusion: always
---

# Project Structure

npm-workspaces monorepo. Four workspaces plus steering and task plans.

```
kiro-mlb-postseason/
├── package.json            # root: workspaces + build/test/typecheck/synth/deploy scripts
├── tsconfig.base.json      # strict TS base config, extended by every workspace
├── shared/                 # @mlb/shared: domain types + bundled seed data
│   └── src/
│       ├── types.ts        # Team, GameResult, Series, Bracket, Prediction, TEAMS
│       ├── seed/
│       │   ├── postseason-2024.json   # aggregated 2024 bracket (fallback dataset)
│       │   └── index.ts               # typed export of the seed as Bracket
│       └── index.ts        # re-exports types + seed
├── backend/                # @mlb/backend: Lambda handlers, MLB client, predict, Bedrock
│   └── src/
├── frontend/               # @mlb/frontend: Vite React SPA + SVG image assets
│   └── src/
├── infra/                  # @mlb/infra: AWS CDK app (S3/CloudFront, APIGW/Lambda, DDB, Bedrock)
│   └── src/
├── .kiro/steering/         # steering docs (this folder)
└── .agents/tasks/          # feature plans for this build
```

## Conventions

- **Workspace package names** are scoped: `@mlb/shared`, `@mlb/backend`, `@mlb/frontend`,
  `@mlb/infra`.
- **Domain types live in `@mlb/shared`.** Both backend and frontend import shared types and
  the seed dataset from `@mlb/shared` (declared as a `"*"` workspace dependency). Never
  duplicate domain types in another workspace.
- **Strict TypeScript everywhere.** Each workspace `tsconfig.json` extends
  `../tsconfig.base.json` and sets its own `rootDir` / `outDir` / `lib`.
- **ES modules.** All workspaces use `"type": "module"`.

## Naming

- Files: `kebab-case.ts` for modules; React components in `PascalCase.tsx`.
- Types / interfaces: `PascalCase`. Constants: `UPPER_SNAKE_CASE` (e.g. `TEAMS`).
- Lambda handlers named by action: `getBracket`, `getPrediction`.

## Tests

- **Vitest**, colocated with the code under test or in a `__tests__/` folder within the
  same workspace (e.g. `backend/src/predict/__tests__/`).
- Mock the AWS SDK and the MLB Stats API; no live calls.
- Prioritize coverage of the prediction model and the MLB to `Series`/`Bracket` aggregation.
