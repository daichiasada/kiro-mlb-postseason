import { useI18n, type MessageKey } from '../i18n';
import { THEME_PREFERENCES, type ThemePreference } from '../theme';
import { useTheme } from '../ThemeContext';

/** Maps each preference to its localized button label key. */
const LABEL_KEY: Record<ThemePreference, MessageKey> = {
  system: 'app.theme.system',
  light: 'app.theme.light',
  dark: 'app.theme.dark',
};

/**
 * System/Light/Dark segmented theme switch for the header.
 *
 * Mirrors {@link LanguageToggle}: a `role="group"` with an accessible label
 * wraps three buttons; the active preference is marked with `aria-pressed`.
 * Clicking switches the theme live (via the theme context) and persists it to
 * localStorage under `mlb.theme`.
 */
export function ThemeToggle() {
  const { t } = useI18n();
  const { preference, setPreference } = useTheme();

  return (
    <div className="app__theme" role="group" aria-label={t('app.theme.group')}>
      {THEME_PREFERENCES.map((pref) => (
        <button
          key={pref}
          type="button"
          className={
            'app__theme-button' +
            (pref === preference ? ' app__theme-button--active' : '')
          }
          aria-pressed={pref === preference}
          onClick={() => setPreference(pref)}
        >
          {t(LABEL_KEY[pref])}
        </button>
      ))}
    </div>
  );
}
