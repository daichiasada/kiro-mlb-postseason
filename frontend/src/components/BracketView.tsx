import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import type { Bracket } from '@mlb/shared';
import { buildRoundColumns } from '../bracketLayout';
import { roundName, useI18n } from '../i18n';
import { useFavorites } from '../FavoritesContext';
import { SeriesCard } from './SeriesCard';
import alMark from '../assets/al.svg';
import nlMark from '../assets/nl.svg';
import wsMark from '../assets/ws.svg';

interface BracketViewProps {
  bracket: Bracket;
  /** The season being viewed; used to build series detail-page links. */
  season: number;
  selectedSeriesId: string | null;
  onSelectSeries: (seriesId: string) => void;
  /** Whether the season is predictable; forwarded to each SeriesCard. */
  predictable?: boolean;
  /**
   * When true, only series that include at least one favorite team are shown.
   * The filter is applied AFTER buildRoundColumns so the roving-tabindex grid
   * and its active-cell clamp operate over the (possibly shrunken) filtered
   * grid, exactly as they do when the season switch changes the grid shape.
   */
  favoritesOnly?: boolean;
}

/** A [column][row] grid position of a focusable series card. */
interface Cell {
  col: number;
  row: number;
}

export function BracketView({
  bracket,
  season,
  selectedSeriesId,
  onSelectSeries,
  predictable = true,
  favoritesOnly = false,
}: BracketViewProps) {
  const { t } = useI18n();
  const { isFavorite } = useFavorites();
  // Build the deterministic round/league columns first, THEN (optionally)
  // filter each column to series that include a favorite team. Filtering after
  // buildRoundColumns keeps the column/round structure identical to the
  // unfiltered view and lets the roving-tabindex clamp below treat a filtered
  // grid exactly like a season-switch-shrunken grid.
  const columns = buildRoundColumns(bracket)
    .map((column) => ({
      ...column,
      series: favoritesOnly
        ? column.series.filter(
            (s) => isFavorite(s.high.teamId) || isFavorite(s.low.teamId),
          )
        : column.series,
    }))
    .filter((column) => column.series.length > 0);
  const alLabel = t('bracket.legend.al');
  const wsLabel = t('bracket.legend.ws');
  const nlLabel = t('bracket.legend.nl');

  // Roving-tabindex model: exactly one card (`active`) is in the tab order at a
  // time. Arrow keys move `active` across the deterministic [column][row] grid
  // derived from buildRoundColumns; Tab then enters/leaves the bracket without
  // trapping focus. Default to the first card so Tab lands somewhere sensible.
  const [active, setActive] = useState<Cell>({ col: 0, row: 0 });
  // Refs to each card <article>, keyed "col-row", so we can move DOM focus when
  // the active cell changes via the keyboard.
  const cardRefs = useRef(new Map<string, HTMLElement>());

  const columnLengths = columns.map((column) => column.series.length);

  // Clamp the active cell to the current grid so a season switch (which changes
  // the column/row counts) always leaves exactly one card tabbable rather than
  // pointing at a cell that no longer exists.
  const activeCol = columnLengths.length
    ? Math.min(active.col, columnLengths.length - 1)
    : 0;
  const activeRow = columnLengths.length
    ? Math.max(0, Math.min(active.row, columnLengths[activeCol] - 1))
    : 0;

  const focusCell = useCallback((cell: Cell) => {
    const el = cardRefs.current.get(`${cell.col}-${cell.row}`);
    el?.focus();
  }, []);

  const moveTo = useCallback(
    (cell: Cell) => {
      setActive(cell);
      // Move DOM focus immediately. `focus()` works regardless of the current
      // tabindex value, so we do not need to wait for the re-render that flips
      // the roving tabindex; the two just converge on the same card.
      focusCell(cell);
    },
    [focusCell],
  );

  const handleKeyDown = useCallback(
    (col: number, row: number) => (event: KeyboardEvent<HTMLElement>) => {
      const colCount = columnLengths.length;
      if (colCount === 0) return;
      const clampRow = (c: number, r: number) =>
        Math.max(0, Math.min(r, columnLengths[c] - 1));

      let next: Cell | null = null;
      switch (event.key) {
        case 'ArrowDown':
          next = { col, row: clampRow(col, row + 1) };
          break;
        case 'ArrowUp':
          next = { col, row: clampRow(col, row - 1) };
          break;
        case 'ArrowRight': {
          const nc = Math.min(col + 1, colCount - 1);
          next = { col: nc, row: clampRow(nc, row) };
          break;
        }
        case 'ArrowLeft': {
          const nc = Math.max(col - 1, 0);
          next = { col: nc, row: clampRow(nc, row) };
          break;
        }
        case 'Home':
          next = { col, row: 0 };
          break;
        case 'End':
          next = { col, row: columnLengths[col] - 1 };
          break;
        default:
          return;
      }

      // preventDefault so the page does not scroll on a handled navigation key.
      event.preventDefault();
      if (next && (next.col !== col || next.row !== row)) {
        moveTo(next);
      }
    },
    [columnLengths, moveTo],
  );

  return (
    <section className="bracket" aria-label={t('bracket.region')}>
      <div className="bracket__legend">
        <span className="bracket__legend-item">
          <img src={alMark} alt={alLabel} width={22} height={22} /> {alLabel}
        </span>
        <span className="bracket__legend-item">
          <img src={wsMark} alt={wsLabel} width={22} height={22} /> {wsLabel}
        </span>
        <span className="bracket__legend-item">
          <img src={nlMark} alt={nlLabel} width={22} height={22} /> {nlLabel}
        </span>
      </div>

      {favoritesOnly && columns.length === 0 ? (
        <p className="bracket__filter-empty" role="status">
          {t('favorites.filter.empty')}
        </p>
      ) : (
      <div
        className="bracket__grid"
        role="group"
        aria-label={t('bracket.gridLabel')}
        style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}
      >
        {columns.map((column, col) => (
          <div key={column.round} className="bracket__column">
            <h3 className="bracket__round-title">{roundName(t, column.round)}</h3>
            <div className="bracket__series-list">
              {column.series.map((series, row) => {
                const isActive = activeCol === col && activeRow === row;
                return (
                  <SeriesCard
                    key={series.id}
                    series={series}
                    season={season}
                    bracket={bracket}
                    selected={series.id === selectedSeriesId}
                    onSelect={onSelectSeries}
                    predictable={predictable}
                    tabIndex={isActive ? 0 : -1}
                    cardRef={(el) => {
                      const key = `${col}-${row}`;
                      if (el) cardRefs.current.set(key, el);
                      else cardRefs.current.delete(key);
                    }}
                    onCardKeyDown={handleKeyDown(col, row)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      )}
    </section>
  );
}
