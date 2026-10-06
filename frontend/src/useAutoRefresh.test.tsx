import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { AUTO_REFRESH_INTERVAL_MS, useAutoRefresh } from './useAutoRefresh';

/** Overrides document.hidden and dispatches a 'visibilitychange' event. */
function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

describe('useAutoRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setHidden(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exposes the documented 60s interval constant', () => {
    expect(AUTO_REFRESH_INTERVAL_MS).toBe(60_000);
  });

  it('polls onRefresh every interval when enabled', () => {
    const onRefresh = vi.fn();
    renderHook(() =>
      useAutoRefresh({ enabled: true, intervalMs: 1000, onRefresh }),
    );

    expect(onRefresh).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1000));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    act(() => void vi.advanceTimersByTime(2000));
    expect(onRefresh).toHaveBeenCalledTimes(3);
  });

  it('does NOT poll when disabled (results-only / no in-progress series)', () => {
    const onRefresh = vi.fn();
    renderHook(() =>
      useAutoRefresh({ enabled: false, intervalMs: 1000, onRefresh }),
    );

    act(() => void vi.advanceTimersByTime(5000));
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('clears the interval on unmount', () => {
    const onRefresh = vi.fn();
    const { unmount } = renderHook(() =>
      useAutoRefresh({ enabled: true, intervalMs: 1000, onRefresh }),
    );

    act(() => void vi.advanceTimersByTime(1000));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    unmount();
    act(() => void vi.advanceTimersByTime(5000));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('stops when the tab is hidden and does not emit stray ticks', () => {
    const onRefresh = vi.fn();
    renderHook(() =>
      useAutoRefresh({ enabled: true, intervalMs: 1000, onRefresh }),
    );

    act(() => void vi.advanceTimersByTime(1000));
    expect(onRefresh).toHaveBeenCalledTimes(1);

    setHidden(true);
    act(() => void vi.advanceTimersByTime(5000));
    // Paused while hidden - no further ticks.
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('fires an immediate refresh and resumes polling on becoming visible', () => {
    const onRefresh = vi.fn();
    renderHook(() =>
      useAutoRefresh({ enabled: true, intervalMs: 1000, onRefresh }),
    );

    setHidden(true);
    act(() => void vi.advanceTimersByTime(5000));
    expect(onRefresh).toHaveBeenCalledTimes(0);

    setHidden(false);
    // Immediate refetch on becoming visible.
    expect(onRefresh).toHaveBeenCalledTimes(1);

    // ...and the interval resumes afterwards.
    act(() => void vi.advanceTimersByTime(2000));
    expect(onRefresh).toHaveBeenCalledTimes(3);
  });

  it('does not reset the running timer when onRefresh identity changes', () => {
    let calls = 0;
    const { rerender } = renderHook(
      ({ cb }: { cb: () => void }) =>
        useAutoRefresh({ enabled: true, intervalMs: 1000, onRefresh: cb }),
      { initialProps: { cb: () => { calls += 1; } } },
    );

    act(() => void vi.advanceTimersByTime(500));
    // New callback identity mid-interval must NOT restart the timer.
    rerender({ cb: () => { calls += 1; } });
    act(() => void vi.advanceTimersByTime(500));
    expect(calls).toBe(1);
  });
});
