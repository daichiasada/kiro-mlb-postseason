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

## Added feature - win/loss prediction

- For a selected series, the app produces a **win/loss prediction**: a favorite team, a
  win probability, and an **AI-generated natural-language narrative** explaining the pick.
- The narrative is produced by **Amazon Bedrock** (Anthropic Claude). The numeric
  probability comes from a deterministic model so results are explainable and testable.

## Constraints and non-goals

- **No authentication.** The site is public and read-only to visitors.
- **Not a betting product.** Predictions are illustrative, not gambling advice.
- **Not a live scoreboard.** Data is the postseason summary (currently the 2024 season),
  refreshed from the MLB Stats API and cached; it is not a real-time play-by-play feed.
- **No user accounts, no personal data.**

## Target users

Baseball fans and casual visitors who want a quick, visual read on the postseason, plus a
fun AI-driven "who will win" angle. Also serves as a Kiro University exam demonstration.

## Data

Current dataset is the **2024 MLB postseason** (Dodgers defeated Yankees in the World
Series). Data is sourced from the public MLB Stats API with a bundled fallback dataset.
