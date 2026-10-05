import { useCallback, useState } from 'react';
import { buildSeriesPermalink } from '@mlb/shared';
import { useI18n } from '../i18n';

interface ShareButtonProps {
  /** The season the series belongs to (route segment of the permalink). */
  season: number;
  /** The series id (deep-link target of the permalink). */
  seriesId: string;
  /** A localized, human title (teams + round) used as the share title. */
  title: string;
  /**
   * The localized disclaimer appended to the share text so a shared prediction
   * is never presented as betting advice (SHARE_DISCLAIMER from '@mlb/shared').
   */
  disclaimer: string;
}

/**
 * Resolves the current page origin, guarded so it is safe under SSR / jsdom
 * where `window` or `location` may be absent. Falls back to an empty origin so
 * the shared permalink is still a well-formed, lang-tagged relative-ish URL
 * rather than throwing.
 */
function resolveOrigin(): string {
  try {
    if (typeof window === 'undefined' || typeof window.location === 'undefined') {
      return '';
    }
    return window.location.origin ?? '';
  } catch {
    return '';
  }
}

/**
 * A localized Share control for a single series.
 *
 * It builds the canonical permalink via the shared {@link buildSeriesPermalink}
 * using the live page origin and the active UI language, so the shared URL
 * carries `?lang=` and opens in the same language for the recipient. On click
 * it prefers the Web Share API (`navigator.share`) and falls back to copying
 * the link to the clipboard (`navigator.clipboard.writeText`), showing a
 * localized "Link copied" confirmation. If neither is available it degrades
 * gracefully by surfacing the URL in a read-only input the user can copy
 * manually. All browser APIs are feature-detected so the component is inert and
 * safe under jsdom.
 */
export function ShareButton({ season, seriesId, title, disclaimer }: ShareButtonProps) {
  const { t, lang } = useI18n();
  const [copied, setCopied] = useState(false);
  // Set only when both Web Share and clipboard are unavailable, so the URL can
  // be shown for manual copy as a last-resort graceful degradation.
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

  const url = buildSeriesPermalink({
    origin: resolveOrigin(),
    season,
    seriesId,
    lang,
  });

  const handleShare = useCallback(async () => {
    setCopied(false);
    setFallbackUrl(null);
    const text = `${title} - ${disclaimer}`;

    // 1) Web Share API (mobile + some desktop browsers).
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        // A rejected/cancelled share falls through to the copy fallback.
      }
    }

    // 2) Clipboard fallback.
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        return;
      } catch {
        // Fall through to the manual-copy degradation.
      }
    }

    // 3) Last resort: surface the URL for manual copy.
    setFallbackUrl(url);
  }, [title, disclaimer, url]);

  return (
    <div className="share">
      <button
        type="button"
        className="share__button"
        aria-label={t('share.ariaLabel')}
        onClick={() => {
          void handleShare();
        }}
      >
        {t('share.button')}
      </button>
      {copied && (
        <span className="share__copied" role="status">
          {t('share.copied')}
        </span>
      )}
      {fallbackUrl !== null && (
        <input
          className="share__url"
          type="text"
          readOnly
          value={fallbackUrl}
          aria-label={t('share.ariaLabel')}
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
    </div>
  );
}
