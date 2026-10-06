import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageToggle } from './LanguageToggle';
import {
  DEFAULT_LANG,
  I18nProvider,
  LANG_STORAGE_KEY,
  readStoredLang,
  useI18n,
} from '../i18n';

/** A probe that renders the active language so switches are observable. */
function LangProbe() {
  const { lang } = useI18n();
  return <span data-testid="lang">{lang}</span>;
}

describe('LanguageToggle', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders a labeled JA/EN group with aria-pressed on the active language', () => {
    render(
      <I18nProvider initialLang="en">
        <LanguageToggle />
      </I18nProvider>,
    );
    const group = screen.getByRole('group', { name: /language|言語/i });
    expect(group).toBeInTheDocument();

    const en = screen.getByRole('button', { name: 'English' });
    const ja = screen.getByRole('button', { name: '日本語' });
    expect(en).toHaveAttribute('aria-pressed', 'true');
    expect(ja).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches language live and persists the choice to localStorage', () => {
    render(
      <I18nProvider initialLang="en">
        <LanguageToggle />
        <LangProbe />
      </I18nProvider>,
    );
    expect(screen.getByTestId('lang')).toHaveTextContent('en');

    fireEvent.click(screen.getByRole('button', { name: '日本語' }));

    // Live switch is reflected in the context...
    expect(screen.getByTestId('lang')).toHaveTextContent('ja');
    expect(
      screen.getByRole('button', { name: '日本語' }),
    ).toHaveAttribute('aria-pressed', 'true');
    // ...and persisted so a reload hydrates to the chosen language.
    expect(readStoredLang()).toBe('ja');
  });

  it('hydrates the initial language from localStorage (default otherwise)', () => {
    expect(DEFAULT_LANG).toBe('ja');
    localStorage.setItem(LANG_STORAGE_KEY, 'en');
    render(
      <I18nProvider>
        <LangProbe />
      </I18nProvider>,
    );
    expect(screen.getByTestId('lang')).toHaveTextContent('en');
  });
});
