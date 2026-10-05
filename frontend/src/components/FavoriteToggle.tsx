import { useFavorites } from '../FavoritesContext';
import { teamName, useI18n } from '../i18n';

interface FavoriteToggleProps {
  teamId: number;
  /** Pixel size of the star glyph. Defaults to 18. */
  size?: number;
}

/**
 * A reusable, accessible star toggle that favorites/unfavorites a team.
 *
 * It is a native <button type="button"> (so it is keyboard-focusable and
 * Enter/Space activate it natively), reads/writes the favorites context, and
 * reflects its state with `aria-pressed`. The star glyph is a real inline SVG
 * whose SHAPE changes with state - a FILLED star when favorited, an OUTLINE
 * star when not - so the state is perceivable without relying on color alone
 * (Issue #18 accessibility requirement). The accessible label is localized via
 * `favorites.add` / `favorites.remove` with the team name interpolated.
 *
 * When placed inside a SeriesCard <article>, the card's own keyboard handler
 * bails out for events whose target is not the article itself, so this button
 * keeps its native behavior and the card never double-activates (#22 model).
 */
export function FavoriteToggle({ teamId, size = 18 }: FavoriteToggleProps) {
  const { t } = useI18n();
  const { isFavorite, toggle } = useFavorites();
  const favorited = isFavorite(teamId);
  const name = teamName(t, teamId);
  const label = favorited
    ? t('favorites.remove', { team: name })
    : t('favorites.add', { team: name });

  return (
    <button
      type="button"
      className={
        'favorite-toggle' + (favorited ? ' favorite-toggle--on' : '')
      }
      aria-pressed={favorited}
      aria-label={label}
      title={label}
      data-team-id={teamId}
      onClick={() => toggle(teamId)}
    >
      <svg
        className="favorite-toggle__star"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        {/* A single star path; filled vs stroked-only distinguishes the state
            by SHAPE (not color): favorited => solid fill, not => hollow. */}
        <path
          d="M12 2.5l2.9 5.88 6.49.94-4.7 4.58 1.11 6.46L12 17.9l-5.8 3.05 1.11-6.46-4.7-4.58 6.49-.94L12 2.5z"
          fill={favorited ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
