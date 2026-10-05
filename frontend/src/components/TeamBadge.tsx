import { TEAMS } from '@mlb/shared';
import { teamColor } from '../teamColors';
import { readableTextColor } from '../readableTextColor';

interface TeamBadgeProps {
  teamId: number;
  size?: number;
}

/**
 * A generated team-color SVG badge showing the team's abbreviation on a disc
 * filled with the team's primary color and ringed with its secondary color.
 * This is a real (inline) SVG image asset, not an emoji.
 */
export function TeamBadge({ teamId, size = 36 }: TeamBadgeProps) {
  const team = TEAMS[teamId];
  const { primary, secondary } = teamColor(teamId);
  const label = team?.abbreviation ?? String(teamId);
  const fontSize = label.length >= 3 ? 13 : 16;

  return (
    <svg
      className="team-badge"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label={team ? `${team.name} badge` : `Team ${teamId} badge`}
      data-team-id={teamId}
    >
      <circle cx="24" cy="24" r="22" fill={primary} />
      <circle cx="24" cy="24" r="22" fill="none" stroke={secondary} strokeWidth="3" />
      <text
        x="24"
        y="24"
        dominantBaseline="central"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize={fontSize}
        fontWeight="700"
        fill={readableTextColor(primary)}
      >
        {label}
      </text>
    </svg>
  );
}
