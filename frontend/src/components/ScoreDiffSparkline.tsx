import type { Series } from '@mlb/shared';
import { seriesScoreDiffs } from '../seriesCharts';
import { teamColor } from '../teamColors';
import { teamAbbr, useI18n, type TFn } from '../i18n';

/**
 * A tiny, decorative inline-SVG score-difference sparkline for a {@link Series}
 * (Issue #24, proposal c).
 *
 * It summarizes the per-game run differentials (reusing the pure FEAT-001
 * {@link seriesScoreDiffs}) as a row of small bars whose height is proportional
 * to the run margin and whose fill is the winning team's brand color (a neutral
 * theme color when there is no resolved winner). It is intentionally subtle and
 * compact so it does not bloat a bracket card or overflow the card width at
 * 375px.
 *
 * Accessibility + keyboard model (critical, see Issue #22): the component is a
 * single `role="img"` SVG with a localized `aria-label`; every child element is
 * `aria-hidden` and NOTHING is focusable (no `tabindex`, no interactive
 * elements). This keeps the SeriesCard roving-tabindex model and its
 * Enter/Space activation unchanged - the sparkline adds zero tab stops. It
 * renders `null` for a series with no games.
 */

/** SVG geometry: a short, wide strip that scales down to fit the card. */
const BAR_W = 6;
const BAR_GAP = 3;
const SVG_H = 18;
const BASELINE_PAD = 1;

/** A neutral fill (theme variable) for games with no resolved winner. */
const NEUTRAL_FILL = 'var(--muted)';

interface ScoreDiffSparklineProps {
  series: Series;
}

/**
 * Build the localized aria-label summary, e.g. "DET +2, DET +3" (winner abbr
 * and the run margin of each game), so a screen-reader user gets the same
 * per-game story the bars convey. A game with no resolved winner (in-progress
 * or unplayed) reads as a localized "no result" phrase instead of claiming a
 * "+0" margin.
 */
function summarize(t: TFn, rows: ReturnType<typeof seriesScoreDiffs>): string {
  return rows
    .map((row) =>
      row.winnerTeamId !== null
        ? `${teamAbbr(t, row.winnerTeamId)} +${row.diff}`
        : t('flow.sparkline.noResult'),
    )
    .join(', ');
}

export function ScoreDiffSparkline({ series }: ScoreDiffSparklineProps) {
  const { t } = useI18n();
  const rows = seriesScoreDiffs(series);
  if (rows.length === 0) {
    return null;
  }

  const maxDiff = Math.max(1, ...rows.map((r) => r.diff));
  const width = rows.length * BAR_W + (rows.length - 1) * BAR_GAP;
  // Usable vertical space for a bar (keep a 1px baseline so a zero-diff game
  // still shows a faint tick).
  const plotH = SVG_H - BASELINE_PAD;

  return (
    <svg
      className="series-card__sparkline"
      viewBox={`0 0 ${width} ${SVG_H}`}
      width={width}
      height={SVG_H}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={t('flow.sparkline.label', {
        count: rows.length,
        summary: summarize(t, rows),
      })}
    >
      {rows.map((row, i) => {
        const h = Math.max(1, (row.diff / maxDiff) * plotH);
        const x = i * (BAR_W + BAR_GAP);
        const y = SVG_H - h;
        const fill =
          row.winnerTeamId !== null
            ? teamColor(row.winnerTeamId).primary
            : NEUTRAL_FILL;
        return (
          <rect
            key={row.gameNumber}
            aria-hidden="true"
            x={x}
            y={y}
            width={BAR_W}
            height={h}
            fill={fill}
            rx={1}
          />
        );
      })}
    </svg>
  );
}
