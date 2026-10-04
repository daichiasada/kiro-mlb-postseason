import type { Bracket } from '@mlb/shared';
import { buildRoundColumns } from '../bracketLayout';
import { roundName, useI18n } from '../i18n';
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
}

export function BracketView({
  bracket,
  season,
  selectedSeriesId,
  onSelectSeries,
  predictable = true,
}: BracketViewProps) {
  const { t } = useI18n();
  const columns = buildRoundColumns(bracket);
  const alLabel = t('bracket.legend.al');
  const wsLabel = t('bracket.legend.ws');
  const nlLabel = t('bracket.legend.nl');

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

      <div className="bracket__grid" style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}>
        {columns.map((column) => (
          <div key={column.round} className="bracket__column">
            <h3 className="bracket__round-title">{roundName(t, column.round)}</h3>
            <div className="bracket__series-list">
              {column.series.map((series) => (
                <SeriesCard
                  key={series.id}
                  series={series}
                  season={season}
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
