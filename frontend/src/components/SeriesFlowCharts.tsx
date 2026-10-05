import { useId, useState, type ReactNode } from 'react';
import type { Bracket, Series } from '@mlb/shared';
import { isPredictable } from '@mlb/shared';
import {
  cumulativeWinTrend,
  seriesScoreDiffs,
  winProbTrend,
  type SeriesScoreDiff,
  type CumulativeWinPoint,
  type WinProbPoint,
} from '../seriesCharts';
import { teamColor } from '../teamColors';
import { readableTextColor } from '../readableTextColor';
import { teamAbbr, useI18n, type TFn } from '../i18n';

/**
 * Series-flow visualization for the detail page (Issue #24, proposals a + b).
 *
 * Renders up to three inline-SVG charts fed by the pure FEAT-001 helpers
 * ({@link seriesScoreDiffs}, {@link cumulativeWinTrend}, {@link winProbTrend}):
 *
 *   1. a per-game run-DIFFERENCE bar chart (bars colored by the winning team's
 *      brand color, height proportional to the run differential);
 *   2. a cumulative series-win trend line chart (one team-colored line each);
 *   3. (predictable season only, with games) a per-game predicted
 *      favorite-win-probability trend line.
 *
 * Every chart is drawn as an accessible SVG (`role="img"` + an accessible name
 * via `aria-labelledby`) AND is paired with a real tabular `<table>`
 * alternative (wired via `aria-describedby`) that conveys the SAME data in
 * TEXT - including the winner as text, never color alone. Axes / gridlines /
 * frames are styled with theme CSS variables (see styles.css `.series-flow*`),
 * so the charts stay legible in light and dark; any text drawn on a team-color
 * fill picks its foreground via {@link readableTextColor}. No chart library is
 * used; SVGs are responsive via `viewBox` and small enough not to overflow at
 * 375px.
 */

interface SeriesFlowChartsProps {
  series: Series;
  bracket: Bracket;
  season: number;
  /**
   * Whether the probability overlay may be shown. Defaults to the season's
   * own predictability per {@link isPredictable}. The overlay still only
   * renders when the series has games.
   */
  predictable?: boolean;
  /** Model accuracy to drive the probability trend (defaults to 0.5). */
  accuracy?: number;
}

/** SVG viewBox geometry shared by all three charts. */
const VIEW_W = 320;
const VIEW_H = 160;
const PAD_LEFT = 34;
const PAD_RIGHT = 10;
const PAD_TOP = 12;
const PAD_BOTTOM = 24;
const PLOT_W = VIEW_W - PAD_LEFT - PAD_RIGHT;
const PLOT_H = VIEW_H - PAD_TOP - PAD_BOTTOM;

/** A neutral fill (theme variable) for bars with no resolved winner. */
const NEUTRAL_FILL = 'var(--muted)';

/** Resolve the localized winner-cell TEXT for a score-diff row. */
function winnerText(t: TFn, row: SeriesScoreDiff): string {
  if (row.winnerTeamId !== null) {
    return t('flow.winner.won', { team: teamAbbr(t, row.winnerTeamId) });
  }
  // Both scored and equal (shouldn't happen in MLB) => tie; otherwise the game
  // has no recorded result yet (in progress / unplayed).
  if (row.awayScore !== null && row.homeScore !== null) {
    return t('flow.winner.tie');
  }
  return t('flow.winner.inProgress');
}

/** Even x position for the i-th of `count` points (bar/line centers). */
function xForIndex(index: number, count: number): number {
  if (count <= 1) return PAD_LEFT + PLOT_W / 2;
  return PAD_LEFT + (PLOT_W * index) / (count - 1);
}

export function SeriesFlowCharts({
  series,
  bracket,
  season,
  predictable,
  accuracy = 0.5,
}: SeriesFlowChartsProps) {
  const { t } = useI18n();
  const reactId = useId().replace(/:/g, '');

  const diffs = seriesScoreDiffs(series);
  const trend = cumulativeWinTrend(series);

  const seasonPredictable = predictable ?? isPredictable(season);
  const showProb = seasonPredictable && series.games.length > 0;
  const probTrend = showProb ? winProbTrend(series, bracket, accuracy) : [];

  // No games at all -> nothing meaningful to visualize.
  if (diffs.length === 0) {
    return null;
  }

  const highId = series.high.teamId;
  const lowId = series.low.teamId;

  return (
    <section className="series-flow" aria-label={t('flow.heading')}>
      <h2 className="series-flow__heading">{t('flow.heading')}</h2>

      <DiffChart t={t} idBase={`${reactId}-diff`} diffs={diffs} />
      <TrendChart
        t={t}
        idBase={`${reactId}-trend`}
        trend={trend}
        highId={highId}
        lowId={lowId}
      />
      {showProb && probTrend.length > 0 && (
        <ProbChart t={t} idBase={`${reactId}-prob`} points={probTrend} />
      )}
    </section>
  );
}

/** Shared wrapper: a titled chart figure with a collapsible data table. */
function ChartFigure({
  t,
  idBase,
  title,
  children,
  table,
}: {
  t: TFn;
  idBase: string;
  title: string;
  children: ReactNode;
  table: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const titleId = `${idBase}-title`;
  const tableId = `${idBase}-table`;
  return (
    <figure className="series-flow__figure">
      <figcaption className="series-flow__title" id={titleId}>
        {title}
      </figcaption>
      <svg
        className="series-flow__svg"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-labelledby={titleId}
        aria-describedby={tableId}
      >
        {children}
      </svg>
      <button
        type="button"
        className="series-flow__table-toggle"
        aria-expanded={open}
        aria-controls={tableId}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? t('flow.hideTable') : t('flow.showTable')}
      </button>
      <div id={tableId} className="series-flow__table-wrap" hidden={!open}>
        {table}
      </div>
    </figure>
  );
}

/** A faint axis frame + baseline, styled via theme CSS classes. */
function AxisFrame() {
  return (
    <g className="series-flow__axis" aria-hidden="true">
      <line x1={PAD_LEFT} y1={PAD_TOP} x2={PAD_LEFT} y2={PAD_TOP + PLOT_H} />
      <line
        x1={PAD_LEFT}
        y1={PAD_TOP + PLOT_H}
        x2={PAD_LEFT + PLOT_W}
        y2={PAD_TOP + PLOT_H}
      />
    </g>
  );
}

function DiffChart({
  t,
  idBase,
  diffs,
}: {
  t: TFn;
  idBase: string;
  diffs: SeriesScoreDiff[];
}) {
  const maxDiff = Math.max(1, ...diffs.map((d) => d.diff));
  const slot = PLOT_W / diffs.length;
  const barW = Math.min(28, slot * 0.6);

  const chart = (
    <>
      <AxisFrame />
      {diffs.map((row, i) => {
        const h = (row.diff / maxDiff) * PLOT_H;
        const cx = PAD_LEFT + slot * (i + 0.5);
        const x = cx - barW / 2;
        const y = PAD_TOP + PLOT_H - h;
        const fill =
          row.winnerTeamId !== null
            ? teamColor(row.winnerTeamId).primary
            : NEUTRAL_FILL;
        const labelColor =
          row.winnerTeamId !== null
            ? readableTextColor(teamColor(row.winnerTeamId).primary)
            : 'var(--surface)';
        return (
          <g key={row.gameNumber}>
            <rect x={x} y={y} width={barW} height={h} fill={fill} rx={2} />
            {row.diff > 0 && h > 14 && (
              <text
                className="series-flow__bar-label"
                x={cx}
                y={y + 11}
                textAnchor="middle"
                fill={labelColor}
              >
                {row.diff}
              </text>
            )}
            <text
              className="series-flow__tick"
              x={cx}
              y={PAD_TOP + PLOT_H + 14}
              textAnchor="middle"
            >
              {row.gameNumber}
            </text>
          </g>
        );
      })}
    </>
  );

  const table = (
    <table className="series-flow__table">
      <caption>{t('flow.table.caption.diff')}</caption>
      <thead>
        <tr>
          <th scope="col">{t('flow.table.game')}</th>
          <th scope="col">{t('flow.table.away')}</th>
          <th scope="col">{t('flow.table.home')}</th>
          <th scope="col">{t('flow.table.diff')}</th>
          <th scope="col">{t('flow.table.winner')}</th>
        </tr>
      </thead>
      <tbody>
        {diffs.map((row) => (
          <tr key={row.gameNumber}>
            <th scope="row">{row.gameNumber}</th>
            <td>
              {teamAbbr(t, row.awayTeamId)} {row.awayScore ?? '-'}
            </td>
            <td>
              {teamAbbr(t, row.homeTeamId)} {row.homeScore ?? '-'}
            </td>
            <td>{row.diff}</td>
            <td>{winnerText(t, row)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartFigure t={t} idBase={idBase} title={t('flow.chart.diff.title')} table={table}>
      {chart}
    </ChartFigure>
  );
}

function TrendChart({
  t,
  idBase,
  trend,
  highId,
  lowId,
}: {
  t: TFn;
  idBase: string;
  trend: CumulativeWinPoint[];
  highId: number;
  lowId: number;
}) {
  const maxWins = Math.max(
    1,
    ...trend.map((p) => Math.max(p.highWins, p.lowWins)),
  );
  const yFor = (wins: number) => PAD_TOP + PLOT_H - (wins / maxWins) * PLOT_H;

  const line = (pick: (p: CumulativeWinPoint) => number) =>
    trend
      .map((p, i) => `${xForIndex(i, trend.length)},${yFor(pick(p))}`)
      .join(' ');

  const highColor = teamColor(highId).primary;
  const lowColor = teamColor(lowId).primary;

  const chart = (
    <>
      <AxisFrame />
      <polyline
        className="series-flow__line"
        points={line((p) => p.highWins)}
        fill="none"
        stroke={highColor}
      />
      <polyline
        className="series-flow__line"
        points={line((p) => p.lowWins)}
        fill="none"
        stroke={lowColor}
      />
      {trend.map((p, i) => (
        <text
          key={p.gameNumber}
          className="series-flow__tick"
          x={xForIndex(i, trend.length)}
          y={PAD_TOP + PLOT_H + 14}
          textAnchor="middle"
        >
          {p.gameNumber}
        </text>
      ))}
    </>
  );

  const table = (
    <table className="series-flow__table">
      <caption>{t('flow.table.caption.trend')}</caption>
      <thead>
        <tr>
          <th scope="col">{t('flow.table.game')}</th>
          <th scope="col">{t('flow.table.highWins', { team: teamAbbr(t, highId) })}</th>
          <th scope="col">{t('flow.table.lowWins', { team: teamAbbr(t, lowId) })}</th>
        </tr>
      </thead>
      <tbody>
        {trend.map((p) => (
          <tr key={p.gameNumber}>
            <th scope="row">{p.gameNumber}</th>
            <td>{p.highWins}</td>
            <td>{p.lowWins}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartFigure t={t} idBase={idBase} title={t('flow.chart.trend.title')} table={table}>
      {chart}
    </ChartFigure>
  );
}

/** Fixed y range the model clamps favorite probability into. */
const PROB_MIN = 0.5;
const PROB_MAX = 0.95;

function ProbChart({
  t,
  idBase,
  points,
}: {
  t: TFn;
  idBase: string;
  points: WinProbPoint[];
}) {
  const yFor = (p: number) => {
    const clamped = Math.min(PROB_MAX, Math.max(PROB_MIN, p));
    const frac = (clamped - PROB_MIN) / (PROB_MAX - PROB_MIN);
    return PAD_TOP + PLOT_H - frac * PLOT_H;
  };

  const linePoints = points
    .map((p, i) => `${xForIndex(i, points.length)},${yFor(p.favoriteWinProbability)}`)
    .join(' ');

  const chart = (
    <>
      <AxisFrame />
      {/* y gridlines at 0.5 / 0.95 bounds for context */}
      <text className="series-flow__tick" x={PAD_LEFT - 4} y={PAD_TOP + 4} textAnchor="end">
        95%
      </text>
      <text
        className="series-flow__tick"
        x={PAD_LEFT - 4}
        y={PAD_TOP + PLOT_H}
        textAnchor="end"
      >
        50%
      </text>
      <polyline
        className="series-flow__line series-flow__line--prob"
        points={linePoints}
        fill="none"
      />
      {points.map((p, i) => (
        <g key={p.gameNumber}>
          <circle
            className="series-flow__dot"
            cx={xForIndex(i, points.length)}
            cy={yFor(p.favoriteWinProbability)}
            r={2.5}
          />
          <text
            className="series-flow__tick"
            x={xForIndex(i, points.length)}
            y={PAD_TOP + PLOT_H + 14}
            textAnchor="middle"
          >
            {p.gameNumber}
          </text>
        </g>
      ))}
    </>
  );

  const table = (
    <table className="series-flow__table">
      <caption>{t('flow.table.caption.prob')}</caption>
      <thead>
        <tr>
          <th scope="col">{t('flow.table.game')}</th>
          <th scope="col">{t('prediction.favorite')}</th>
          <th scope="col">{t('flow.table.probability')}</th>
        </tr>
      </thead>
      <tbody>
        {points.map((p) => (
          <tr key={p.gameNumber}>
            <th scope="row">{p.gameNumber}</th>
            <td>{teamAbbr(t, p.favoriteTeamId)}</td>
            <td>{Math.round(p.favoriteWinProbability * 100)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartFigure t={t} idBase={idBase} title={t('flow.chart.prob.title')} table={table}>
      {chart}
    </ChartFigure>
  );
}
