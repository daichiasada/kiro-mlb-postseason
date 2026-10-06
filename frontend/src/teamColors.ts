/**
 * Team brand colors used by the UI (team-color SVG badges, charts).
 *
 * The color data now lives in `@mlb/shared` so the backend OG-image builder
 * and the frontend render from one source of truth. This module is a thin
 * re-export that keeps the existing `teamColor` named export and `TeamColor`
 * type stable for all frontend consumers.
 */
export { teamColor, DEFAULT_TEAM_COLOR, TEAM_COLORS } from '@mlb/shared';
export type { TeamColor } from '@mlb/shared';
