import type { Bracket } from '@mlb/shared';
import { favoriteSummary, type FavoriteSummary } from '../bracketLayout';
import { formatStartTime, resolveTimeZone } from '../gameTime';
import { useFavorites } from '../FavoritesContext';
import { roundName, teamName, useI18n, type Lang, type TFn } from '../i18n';
import { TeamBadge } from './TeamBadge';

interface FavoritesPinProps {
  bracket: Bracket;
}

/**
 * Builds the localized status line for a single favorite's current standing:
 *  - eliminated  => "Eliminated" / "敗退"
 *  - champion    => "Champion" / "優勝"
 *  - in_progress => "{round}, leading/trailing/tied {wins}-{losses}"
 *  - scheduled   => the next game's local time (via gameTime), else "starts soon"
 */
function statusLine(
  t: TFn,
  lang: Lang,
  timeZone: string,
  summary: FavoriteSummary,
): string {
  if (summary.eliminated) return t('favorites.eliminated');
  if (summary.isChampion) return t('favorites.champion');

  const series = summary.currentSeries;
  if (!series || !summary.record) {
    return summary.furthestRound
      ? t('favorites.header.status.scheduled', {
          round: roundName(t, summary.furthestRound),
        })
      : '';
  }

  const round = roundName(t, series.round);
  const { wins, losses } = summary.record;

  if (series.status === 'scheduled') {
    // Prefer the next game's concrete local start time when one exists.
    const firstTimed = series.games.find(
      (g) => g.startTime !== undefined && g.timeTbd !== true,
    );
    if (firstTimed) {
      const time = formatStartTime(firstTimed.startTime, {
        lang,
        timeZone,
        timeTbd: firstTimed.timeTbd,
        tbdLabel: t('gametime.tbd'),
      });
      return t('favorites.header.status.nextGame', { time });
    }
    return t('favorites.header.status.scheduled', { round });
  }

  // in_progress: leading / trailing / tied by the favorite's own record.
  const key =
    wins > losses
      ? 'favorites.header.status.leading'
      : wins < losses
        ? 'favorites.header.status.trailing'
        : 'favorites.header.status.tied';
  return t(key, { round, wins, losses });
}

/**
 * The header "pin" summarizing each favorite team's current standing in the
 * selected season's bracket.
 *
 * Renders NOTHING (no empty box) when there are no favorites, or when none of
 * the favorites appear in this bracket (every favoriteSummary has
 * `inBracket === false`). For an in-bracket favorite it shows the team badge,
 * name, and a localized status line that switches to an "Eliminated" / "敗退"
 * indication when the team lost a final series (Issue #18 criterion 2).
 */
export function FavoritesPin({ bracket }: FavoritesPinProps) {
  const { t, lang } = useI18n();
  const { favorites } = useFavorites();
  const timeZone = resolveTimeZone();

  const entries = favorites
    .map((teamId) => favoriteSummary(bracket, teamId))
    .filter((summary) => summary.inBracket);

  if (entries.length === 0) return null;

  return (
    <section
      className="favorites-pin"
      aria-label={t('favorites.header.title')}
      data-testid="favorites-pin"
    >
      <h2 className="favorites-pin__title">{t('favorites.header.title')}</h2>
      <ul className="favorites-pin__list">
        {entries.map((summary) => {
          const classes = ['favorites-pin__item'];
          if (summary.eliminated) classes.push('favorites-pin__item--eliminated');
          if (summary.isChampion) classes.push('favorites-pin__item--champion');
          return (
            <li
              key={summary.teamId}
              className={classes.join(' ')}
              data-team-id={summary.teamId}
            >
              <TeamBadge teamId={summary.teamId} size={26} />
              <span className="favorites-pin__team">
                {teamName(t, summary.teamId)}
              </span>
              <span className="favorites-pin__status">
                {statusLine(t, lang, timeZone, summary)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
