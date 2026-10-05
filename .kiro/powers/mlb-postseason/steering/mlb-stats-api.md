# MLB Stats API usage notes (bundled steering)

This steering doc ships inside the `mlb-postseason` Kiro Power. Install the power
to make these notes available to Kiro when working on postseason data.

## Endpoint

```
GET https://statsapi.mlb.com/api/v1/schedule/postseason?sportId=1&season=YYYY
```

Public, no auth. Returns `dates[].games[]`. The project flattens all games
across every date into one list.

## Fields the aggregator consumes

Per game (`RawGame`):

- `gamePk` - unique game id.
- `gameDate` - ISO timestamp; the project keeps the `YYYY-MM-DD` prefix.
- `seriesDescription` - e.g. `AL Wild Card Series`, `NL Division Series`,
  `AL Championship Series`, `World Series`. Drives round + league mapping.
- `seriesGameNumber` - 1-based game number within the series.
- `gamesInSeries` - best-of length (3 / 5 / 7).
- `teams.away` and `teams.home`, each with:
  - `team.id`, `team.name`
  - `score`
  - `isWinner`
  - `leagueRecord.pct` (regular-season win pct, optional)

## Mapping rules

- Round: match the lowercased description against `wild card`, `division
  series`, `championship series`, `world series`.
- League: `World Series` -> `WS`; description starting `al` -> `AL`; starting
  `nl` -> `NL`.
- High seed = home team of game 1 (home-field advantage).
- Group games into a series by `(seriesDescription + unordered team pair)`.
- `bestOf` from `gamesInSeries`, defaulting 3 (Wild Card), 5 (Division), else 7.
- Status: `final` when either team reaches `ceil(bestOf / 2)` wins; `scheduled`
  when no games; otherwise `in_progress`.

## Resilience

The site never fails on upstream outages: a DynamoDB cache is checked first, and
a bundled 2024 seed dataset is served when the live API is unreachable for the
2024 season.
