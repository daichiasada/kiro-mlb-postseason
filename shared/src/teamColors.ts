/**
 * Primary brand colors for the teams in the postseason datasets, keyed by MLB
 * Stats API team id. These live in `@mlb/shared` so both the frontend (team
 * badges, charts) and the backend OG-image builder render from one source of
 * truth. `primary` is the badge fill / brand split color; `secondary` is used
 * for the ring/accent.
 *
 * This module is intentionally dependency-free.
 */
export interface TeamColor {
  primary: string;
  secondary: string;
}

/** Neutral fallback used for any team id without an explicit brand color. */
export const DEFAULT_TEAM_COLOR: TeamColor = { primary: '#334155', secondary: '#e2e8f0' };

/** Brand colors keyed by MLB Stats API team id. */
export const TEAM_COLORS: Record<number, TeamColor> = {
  110: { primary: '#df4601', secondary: '#000000' }, // Orioles
  114: { primary: '#00385d', secondary: '#e50022' }, // Guardians
  116: { primary: '#0c2340', secondary: '#fa4616' }, // Tigers
  117: { primary: '#002d62', secondary: '#eb6e1f' }, // Astros
  118: { primary: '#004687', secondary: '#bd9b60' }, // Royals
  119: { primary: '#005a9c', secondary: '#ef3e42' }, // Dodgers
  121: { primary: '#002d72', secondary: '#ff5910' }, // Mets
  135: { primary: '#2f241d', secondary: '#ffc425' }, // Padres
  139: { primary: '#092c5c', secondary: '#8fbce6' }, // Rays
  143: { primary: '#e81828', secondary: '#002d72' }, // Phillies
  144: { primary: '#13274f', secondary: '#ce1141' }, // Braves
  145: { primary: '#27251f', secondary: '#c4ced4' }, // White Sox
  147: { primary: '#0c2340', secondary: '#c4ced4' }, // Yankees
  158: { primary: '#12284b', secondary: '#ffc52f' }, // Brewers
};

/** Resolve a team's brand colors, falling back to {@link DEFAULT_TEAM_COLOR}. */
export function teamColor(teamId: number): TeamColor {
  return TEAM_COLORS[teamId] ?? DEFAULT_TEAM_COLOR;
}
