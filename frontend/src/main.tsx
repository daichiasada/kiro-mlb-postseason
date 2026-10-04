import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { I18nProvider } from './i18n';
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
      <I18nProvider>
        <App />
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
);
