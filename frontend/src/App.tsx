import { Navigate, Route, Routes } from 'react-router-dom';
import { DEFAULT_SEASON } from './config';
import { HomePage } from './pages/HomePage';
import { SeriesDetailPage } from './pages/SeriesDetailPage';

/**
 * Top-level route table for the SPA.
 *
 * Routes are path-based (history mode via {@link BrowserRouter} in main.tsx):
 *   - `/`                                 -> redirect to the default season
 *   - `/season/:season`                   -> the bracket + standings + prediction
 *   - `/season/:season/series/:seriesId`  -> a finished series' detail page
 *
 * The season lives in the URL so a bracket view and any series detail page are
 * deep-linkable and the selected season is preserved across navigation.
 */
export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={`/season/${DEFAULT_SEASON}`} replace />} />
      <Route path="/season/:season" element={<HomePage />} />
      <Route
        path="/season/:season/series/:seriesId"
        element={<SeriesDetailPage />}
      />
      {/* Unknown paths fall back to the default season bracket. */}
      <Route path="*" element={<Navigate to={`/season/${DEFAULT_SEASON}`} replace />} />
    </Routes>
  );
}
