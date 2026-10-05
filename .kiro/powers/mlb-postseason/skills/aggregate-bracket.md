# Skill: aggregate the postseason schedule into a bracket

A bundled skill for the `mlb-postseason` Kiro Power. Use it when you need to turn
raw MLB Stats API schedule data into the project's `Bracket` shape, or to reason
about that transformation.

## When to use

- Adding a new season to the seed dataset.
- Debugging why a series was grouped or seeded a certain way.
- Explaining the bracket data model to a reviewer.

## Steps

1. Fetch the schedule (the power bundles an `mlb-fetch` MCP server for this):
   `GET https://statsapi.mlb.com/api/v1/schedule/postseason?sportId=1&season=YYYY`.
2. Flatten `dates[].games[]` into a single list of raw games.
3. Group games by `(seriesDescription + unordered team pair)`.
4. For each group:
   - `round` and `league` from `seriesDescription`.
   - high seed = home team of game 1; low seed = the other team.
   - `bestOf` from `gamesInSeries` (default 3/5/7 by round).
   - tally `high.wins` / `low.wins` from each game's `isWinner`.
   - `status` from the clinch count `ceil(bestOf / 2)`.
   - id = `${season}-${league}-${roundSlug}-${highId}-${lowId}`.
5. Sort series by round progression, then league, then high-seed id.

## Reference implementation

The exact logic lives in the repo at `backend/src/mlb/aggregate.ts` and is
covered by `backend/src/mlb/aggregate.test.ts` and
`backend/src/mlb/aggregate.property.test.ts`. Keep this skill in sync with that
code; the code is the source of truth.
