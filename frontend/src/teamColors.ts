/**
 * Primary brand colors for the teams in the 2024 postseason, keyed by MLB
 * Stats API team id. Used to generate team-color SVG badges in the UI.
 * `primary` is the badge fill; `secondary` is used for the ring/accent.
 */
export interface TeamColor {
  primary: string;
  secondary: string;
}

const DEFAULT_COLOR: TeamColor = { primary: '#334155', secondary: '#e2e8f0' };

const TEAM_COLORS: Record<number, TeamColor> = {
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

export function teamColor(teamId: number): TeamColor {
  return TEAM_COLORS[teamId] ?? DEFAULT_COLOR;
}
