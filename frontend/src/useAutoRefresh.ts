import { useEffect, useRef } from 'react';

/**
 * Background auto-refresh interval, in milliseconds.
 *
 * 60s is chosen deliberately (and matches Issue #17's suggestion): it keeps
 * fans watching an in-progress series reasonably up to date while staying well
 * under the backend's ~15 minute bracket cache TTL, so polling never
 * out-paces the data that can actually change and never hammers the API.
 */
export const AUTO_REFRESH_INTERVAL_MS = 60_000;

export interface UseAutoRefreshOptions {
  /**
   * When false the hook does nothing (no interval, no listeners) - this is how
   * results-only seasons and brackets with no in-progress series opt out of
   * polling entirely.
   */
  enabled: boolean;
  /** Poll period in ms. Defaults to {@link AUTO_REFRESH_INTERVAL_MS}. */
  intervalMs?: number;
  /** Called on each tick, and once immediately when the tab becomes visible. */
  onRefresh: () => void;
}

/**
 * Polls `onRefresh` on a fixed interval while `enabled`, pausing when the tab
 * is hidden (Page Visibility API) and resuming - with an immediate refetch - on
 * becoming visible again. The interval is cleared on unmount and whenever
 * `enabled` flips to false.
 *
 * `onRefresh` is held in a ref so a changing callback identity does not reset
 * the running timer (the common React case where the parent re-creates the
 * handler every render). The hook is safe under jsdom/SSR: it guards
 * `typeof document` before touching the Page Visibility API.
 */
export function useAutoRefresh({
  enabled,
  intervalMs = AUTO_REFRESH_INTERVAL_MS,
  onRefresh,
}: UseAutoRefreshOptions): void {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (!enabled) return;

    const hasDocument = typeof document !== 'undefined';
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer !== null) return;
      timer = setInterval(() => onRefreshRef.current(), intervalMs);
    };

    const stop = () => {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    };

    const handleVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        // Resume: refetch immediately so a tab that was hidden for a while is
        // not stuck showing stale data until the next tick, then restart.
        onRefreshRef.current();
        start();
      }
    };

    // Only run while visible. If the tab starts hidden, wait for visibility.
    if (!hasDocument || !document.hidden) {
      start();
    }

    if (hasDocument) {
      document.addEventListener('visibilitychange', handleVisibility);
    }

    return () => {
      stop();
      if (hasDocument) {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
    };
  }, [enabled, intervalMs]);
}
