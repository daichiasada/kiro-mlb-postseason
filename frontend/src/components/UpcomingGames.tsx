import type { Bracket } from '@mlb/shared';
import { countdownParts, selectUpcomingGames } from '../upcomingGames';
import { formatStartTime, resolveTimeZone } from '../gameTime';
import { roundName, teamName, useI18n } from '../i18n';

interface UpcomingGamesProps {
  bracket: Bracket;
  /**
   * Current instant used both to bucket games into today/tomorrow and to drive
   * the countdown. Injectable (defaults to `new Date()`) so the section renders
   * deterministically in unit tests regardless of the host clock.
   */
  now?: Date;
  /**
   * IANA time zone the games are bucketed and rendered in. Injectable (defaults
   * to the browser's resolved zone) so tests pin it instead of inheriting the
   * sandbox/CI zone, which is not Japan.
   */
  timeZone?: string;
}

/**
 * A compact "Today's and tomorrow's games" section listing every upcoming game
 * across the bracket (per {@link selectUpcomingGames}) with its matchup, its
 * localized local start time, and a countdown to first pitch.
 *
 * Renders nothing when there are no upcoming games - a results-only season, a
 * bracket with only finished games, or one whose remaining games are all
 * time-TBD (those are skipped upstream because they have no concrete instant to
 * bucket). This keeps the home page clean out of season and never throws.
 */
export function UpcomingGames({
  bracket,
  now = new Date(),
  timeZone = resolveTimeZone(),
}: UpcomingGamesProps) {
  const { t, lang } = useI18n();
  const upcoming = selectUpcomingGames(bracket, now, timeZone);

  if (upcoming.length === 0) {
    return null;
  }

  return (
    <section
      className="upcoming"
      aria-label={t('upcoming.region')}
      data-testid="upcoming-games"
    >
      <h2 className="upcoming__title">{t('upcoming.title')}</h2>
      <ul className="upcoming__list">
        {upcoming.map(({ series, game, bucket }) => {
          const matchup = `${teamName(t, series.high.teamId)} ${t('upcoming.vs')} ${teamName(t, series.low.teamId)}`;
          // selectUpcomingGames only returns games with a concrete startTime
          // (timeTbd / undefined-start games are skipped upstream), so the
          // non-null assertion is safe and formatStart never hits its TBD path.
          const startTime = game.startTime as string;
          const localTime = formatStartTime(startTime, {
            lang,
            timeZone,
            tbdLabel: t('gametime.tbd'),
          });
          const { days, hours, minutes } = countdownParts(startTime, now);

          return (
            <li
              key={game.gamePk}
              className="upcoming__item"
              data-bucket={bucket}
            >
              <span className="upcoming__bucket">
                {t(bucket === 'today' ? 'upcoming.today' : 'upcoming.tomorrow')}
              </span>
              <span className="upcoming__round">
                {roundName(t, series.round)}
              </span>
              <span className="upcoming__matchup">{matchup}</span>
              <time className="upcoming__time" dateTime={startTime}>
                {localTime}
              </time>
              <span className="upcoming__countdown">
                {t('upcoming.countdown', { days, hours, minutes })}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
