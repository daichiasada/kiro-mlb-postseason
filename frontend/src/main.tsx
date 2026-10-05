import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { I18nProvider } from './i18n';
import { ThemeProvider } from './ThemeContext';
import { FavoritesProvider } from './FavoritesContext';
import './styles.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root not found');
}

createRoot(container).render(
  <StrictMode>
    {/*
      History (path-based) routing. CloudFront already rewrites 403/404 to
      /index.html with responseHttpStatus 200 (see
      infra/lib/mlb-postseason-stack.ts), so deep links like
      /season/2024/series/<id> resolve to the SPA after deploy.
    */}
    <BrowserRouter>
      {/*
        The i18n context lives inside the router so route components can both
        read params and translate. It hydrates the language from localStorage
        (default 'ja') and persists changes made via the header toggle.
      */}
      {/*
        The theme context wraps the whole app so every route (home, detail,
        accuracy) inherits the resolved light/dark theme it applies to
        <html data-theme>. An inline script in index.html sets data-theme
        before React mounts to avoid a light-to-dark flash on first paint.
      */}
      <ThemeProvider>
        <I18nProvider>
          {/*
            Favorites live inside the i18n context so the (FEAT-002) favorite
            UI - star toggles, the header pin, and the filter - can translate.
            The provider hydrates the chosen team ids from localStorage
            ('mlb.favorites') and persists changes.
          */}
          <FavoritesProvider>
            <App />
          </FavoritesProvider>
        </I18nProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
