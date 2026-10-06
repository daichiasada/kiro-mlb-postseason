import { LANGS, useI18n } from '../i18n';

/**
 * JA/EN segmented language switch for the header.
 *
 * A `role="group"` with an accessible label wraps two buttons; the active
 * language is marked with `aria-pressed`. Clicking switches the language live
 * (via the i18n context) and persists it to localStorage.
 */
export function LanguageToggle() {
  const { lang, setLang, t } = useI18n();

  return (
    <div
      className="app__lang"
      role="group"
      aria-label={t('app.lang.group')}
    >
      {LANGS.map((code) => (
        <button
          key={code}
          type="button"
          className={
            'app__lang-button' +
            (code === lang ? ' app__lang-button--active' : '')
          }
          aria-pressed={code === lang}
          onClick={() => setLang(code)}
        >
          {t(code === 'ja' ? 'app.lang.ja' : 'app.lang.en')}
        </button>
      ))}
    </div>
  );
}
