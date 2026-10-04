---
inclusion: always
---

# Testing conventions

Testing is a first-class part of this build. Three layers work together and all
must stay green.

## 1. Unit tests (Vitest)

- Live next to the code as `*.test.ts` in the backend and frontend workspaces.
- Cover pure logic directly: the deterministic `predict()` model, the MLB
  `aggregateBracket()` function, the Bedrock narrative builder and its
  deterministic fallback, and the `BracketService` resolution order.
- No live AWS or network calls. Inject mocks through the service's dependency
  interfaces (`BracketStore`, `fetchSchedule`, `BedrockInvoker`).
- Run with `npm test -w @mlb/backend` (or `npm test` from the root for all
  workspaces).

## 2. Property-based tests (fast-check, IDE-only lesson)

- Named `*.property.test.ts` and run under the same Vitest command.
- Use `fc.assert(fc.property(...))` with generators that produce many valid
  random inputs per invariant, instead of a handful of hand-picked cases.
- Current invariants exercised against REAL functions:
  - `predict()` -> `favoriteWinProbability` is always within `[0.5, 0.95]` and
    `favoriteTeamId` is always one of the two series teams.
  - `aggregateBracket()` -> each series' `high.wins`/`low.wins` never exceed
    `bestOf`; `status` is `scheduled | in_progress | final`; `league` is
    `AL | NL | WS`; `round` is one of the four `RoundName` values.
- When a property fails, read the shrunk counterexample fast-check prints; it is
  the minimal input that breaks the invariant.

## 3. End-to-end UI tests (Playwright)

- Live in `frontend/e2e/` as `*.spec.ts`.
- Drive the built SPA to validate the bracket view, standings panel, and the
  win/loss prediction flow, including graceful rendering when the API is slow.
- Run with `npm run test:e2e -w @mlb/frontend`. These use the agent-browser /
  Playwright Kiro Power.

## Rules

- Add or update tests in the same change as the behavior they cover (test-first
  where practical).
- Keep `npm run build`, `npm test`, and `npm run synth` all passing before a
  change is considered done.
