import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeToggle } from './ThemeToggle';
import { I18nProvider } from '../i18n';
import { ThemeProvider, useTheme } from '../ThemeContext';
import { THEME_STORAGE_KEY, readStoredTheme } from '../theme';

/** A probe that renders the active preference + resolved theme. */
function ThemeProbe() {
  const { preference, resolved } = useTheme();
  return (
    <>
      <span data-testid="pref">{preference}</span>
      <span data-testid="resolved">{resolved}</span>
    </>
  );
}

function renderToggle(initialPreference?: 'light' | 'dark' | 'system') {
  return render(
    <I18nProvider initialLang="en">
      <ThemeProvider initialPreference={initialPreference}>
        <ThemeToggle />
        <ThemeProbe />
      </ThemeProvider>
    </I18nProvider>,
  );
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('renders a labeled System/Light/Dark group with aria-pressed on the active choice', () => {
    renderToggle('system');
    const group = screen.getByRole('group', { name: /theme|テーマ/i });
    expect(group).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'System' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('switches to Dark live, applies data-theme, and persists to localStorage', () => {
    renderToggle('light');
    expect(screen.getByTestId('pref')).toHaveTextContent('light');

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));

    // Preference + resolved theme update live...
    expect(screen.getByTestId('pref')).toHaveTextContent('dark');
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');
    expect(
      screen.getByRole('button', { name: 'Dark' }),
    ).toHaveAttribute('aria-pressed', 'true');
    // ...the document reflects the resolved theme...
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    // ...and the choice is persisted so a reload rehydrates to it.
    expect(readStoredTheme()).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });
});
