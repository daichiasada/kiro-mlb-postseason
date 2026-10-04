---
inclusion: always
---

# Product - MLB Postseason Summary Site

## Vision

A lightweight web app that gives a clear, **graphical summary of the MLB postseason**.
A fan can open the site and instantly understand where the postseason stands: which teams
advanced, how each series played out, and who is still alive.

## Core features

- **Graphical postseason view:** a bracket from the Wild Card round through the World
  Series, showing each series, the two teams, the series score (wins), and status
  (scheduled / in progress / final).
- **Series detail:** per-series game-by-game results (scores and winners).
- **Standings / summary panel:** at-a-glance view of how teams performed.

## Seasons

- The app is **year-aware** and multi-season. Its notion of "now" is the current year
  **2026**, defined once in `@mlb/shared` (`shared/src/season.ts`), not scattered as a
  literal.
- The season selector offers **2024, 2025, and 2026**; 2026 (the current year) is the
  default.
- **Past seasons (2024, 2025) are results-only.** They are completed, so the app shows
  final results and the prediction feature is hidden for them.
- **The current season (2026) is predictable.** It is the in-progress postseason, so the
  prediction feature is offered. When 2026 has not started yet the app shows a graceful
  "has not started" message rather than a broken bracket.

## Added feature - win/loss prediction

- For a selected series **in the current (in-progress) season**, the app produces a
  **win/loss prediction**: a favorite team, a win probability, and an **AI-generated
  natural-language narrative** explaining the pick.
- The narrative is produced by **Amazon Bedrock** (Anthropic Claude). The numeric
  probability comes from a deterministic model so results are explainable and testable.
- The prediction feature is **only offered for the current season**. Past, completed
  seasons are results-only and never trigger a prediction.

## Constraints and non-goals

- **No authentication.** The site is public and read-only to visitors.
- **Not a betting product.** Predictions are illustrative, not gambling advice.
- **Not a live scoreboard.** Data is the postseason summary, refreshed from the MLB Stats
  API and cached; it is not a real-time play-by-play feed.
- **No user accounts, no personal data.**

## Target users

Baseball fans and casual visitors who want a quick, visual read on the postseason, plus a
fun AI-driven "who will win" angle. Also serves as a Kiro University exam demonstration.

## Data

Data is sourced from the public MLB Stats API with bundled fallback datasets. The app
covers multiple seasons:

- **2024** (results-only): Dodgers defeated Yankees 4-1 in the World Series. Bundled seed.
- **2025** (results-only): Dodgers defeated Blue Jays 4-3 in the World Series. Bundled
  seed aggregated from real MLB Stats API data.
- **2026** (current, predictable): fetched live from the MLB Stats API, with graceful
  handling of an empty or not-yet-started postseason.
