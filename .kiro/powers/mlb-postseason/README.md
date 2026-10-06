# MLB Postseason Helper (Kiro Power)

A small, self-contained Kiro Power that packages the domain knowledge this
project relies on, so it can be installed into any Kiro surface working on the
MLB Postseason Summary Site. This directory is the BONUS "package a Kiro Power"
deliverable.

It is intentionally kept outside the npm workspaces so it is a non-built asset
and does not affect the root `npm run build` / `npm test` / `npm run synth`.

## Contents

```
.kiro/powers/mlb-postseason/
  power.json                     # power manifest (name, version, steering, skills, MCP)
  steering/mlb-stats-api.md      # bundled steering: MLB Stats API usage + mapping rules
  skills/aggregate-bracket.md    # bundled skill: how to aggregate schedule -> bracket
  README.md                      # this file
```

## What it provides

- **Steering** (`steering/mlb-stats-api.md`): the MLB Stats API endpoint, the
  fields the aggregator consumes, the round/league/seed mapping rules, and the
  cache + seed resilience strategy.
- **Skill** (`skills/aggregate-bracket.md`): a step-by-step guide for turning
  the raw postseason schedule into the project's `Bracket` shape, pointing at
  the real reference implementation in `backend/src/mlb/aggregate.ts`.
- **MCP server** (`mlb-fetch`): a `uvx mcp-server-fetch` HTTP fetch server for
  consulting the live MLB Stats API while developing.

## Install / use

1. Copy or symlink this directory into your Kiro powers location.
2. Kiro reads `power.json` and registers the bundled steering, skill, and the
   `mlb-fetch` MCP server (the server needs `uvx` / the `uv` toolchain on PATH).
3. Ask the agent to aggregate a season, or to explain the bracket model, and the
   bundled steering + skill guide the response.

## Notes

- No secrets are bundled. The `mlb-fetch` MCP server talks only to the public
  MLB Stats API.
- The repository code (`backend/src/mlb/aggregate.ts` and its unit +
  property-based tests) is the source of truth; keep the skill in sync with it.
