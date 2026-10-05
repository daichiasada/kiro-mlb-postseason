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
  // Set only when both Web Share and clipboard are unavailable, so the full
  // share payload (title + disclaimer + URL) can be shown for manual copy as a
  // last-resort graceful degradation.
  const [fallbackText, setFallbackText] = useState<string | null>(null);

  const url = buildSeriesPermalink({
    origin: resolveOrigin(),
    season,
    seriesId,
    lang,
  });

  const handleShare = useCallback(async () => {
    setCopied(false);
    setFallbackText(null);
    const text = `${title} - ${disclaimer}`;
    // The copy / manual-copy fallbacks share the SAME payload as the Web Share
    // `text` so a user who copies the link does not lose the disclaimer: title,
    // disclaimer, then the permalink on its own line.
    const copyPayload = `${text}\n${url}`;

    // 1) Web Share API (mobile + some desktop browsers).
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        // A rejected/cancelled share falls through to the copy fallback.
      }
    }

    // 2) Clipboard fallback: copy title + disclaimer + URL, not a bare link.
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      try {
        await navigator.clipboard.writeText(copyPayload);
        setCopied(true);
        return;
      } catch {
        // Fall through to the manual-copy degradation.
      }
    }

    // 3) Last resort: surface the full payload (incl. disclaimer) for manual copy.
    setFallbackText(copyPayload);
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
      {fallbackText !== null && (
        // A <textarea> (not <input>) so the multi-line payload - title,
        // disclaimer, and URL - is preserved verbatim for manual copy; an
        // <input> would strip the newlines.
        <textarea
          className="share__url"
          readOnly
          rows={3}
          value={fallbackText}
          aria-label={t('share.ariaLabel')}
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
    </div>
  );
}
