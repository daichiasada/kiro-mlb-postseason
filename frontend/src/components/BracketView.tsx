import type { Bracket } from '@mlb/shared';
import { buildRoundColumns } from '../bracketLayout';
import { SeriesCard } from './SeriesCard';
import alMark from '../assets/al.svg';
import nlMark from '../assets/nl.svg';
import wsMark from '../assets/ws.svg';

interface BracketViewProps {
  bracket: Bracket;
  selectedSeriesId: string | null;
  onSelectSeries: (seriesId: string) => void;
  /** Whether the season is predictable; forwarded to each SeriesCard. */
  predictable?: boolean;
}

export function BracketView({
  bracket,
  selectedSeriesId,
  onSelectSeries,
  predictable = true,
}: BracketViewProps) {
  const columns = buildRoundColumns(bracket);

  return (
    <section className="bracket" aria-label="Postseason bracket">
      <div className="bracket__legend">
        <span className="bracket__legend-item">
          <img src={alMark} alt="American League" width={22} height={22} /> American League
        </span>
        <span className="bracket__legend-item">
          <img src={wsMark} alt="World Series" width={22} height={22} /> World Series
        </span>
        <span className="bracket__legend-item">
          <img src={nlMark} alt="National League" width={22} height={22} /> National League
        </span>
      </div>

      <div className="bracket__grid" style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}>
        {columns.map((column) => (
          <div key={column.round} className="bracket__column">
            <h3 className="bracket__round-title">{column.round}</h3>
            <div className="bracket__series-list">
              {column.series.map((series) => (
                <SeriesCard
                  key={series.id}
                  series={series}
                  selected={series.id === selectedSeriesId}
                  onSelect={onSelectSeries}
                  predictable={predictable}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
