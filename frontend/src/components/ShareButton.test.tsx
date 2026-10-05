import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { SHARE_DISCLAIMER } from '@mlb/shared';
import { ShareButton } from './ShareButton';
import { I18nProvider, type Lang } from '../i18n';

const SEASON = 2024;
const SERIES_ID = 'al-wc-1';
const TITLE = 'Houston Astros vs Seattle Mariners - Championship Series';

/** Renders a ShareButton inside the i18n provider pinned to a language. */
function renderShare(lang: Lang, node?: ReactElement) {
  return render(
    <I18nProvider initialLang={lang}>
      {node ?? (
        <ShareButton
          season={SEASON}
          seriesId={SERIES_ID}
          title={TITLE}
          disclaimer={SHARE_DISCLAIMER[lang]}
        />
      )}
    </I18nProvider>,
  );
}

describe('ShareButton', () => {
  // jsdom has no window.location.origin by default control; it is 'http://localhost'.
  beforeEach(() => {
    // Ensure a clean navigator between cases.
    delete (navigator as unknown as { share?: unknown }).share;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (navigator as unknown as { share?: unknown }).share;
  });

  it('calls navigator.share with a lang-tagged permalink and disclaimer text when Web Share is present', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      writable: true,
      value: share,
    });

    renderShare('en');
    fireEvent.click(screen.getByRole('button', { name: 'Share this series' }));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const arg = share.mock.calls[0][0] as {
      title: string;
      text: string;
      url: string;
    };
    expect(arg.url).toContain(SERIES_ID);
    expect(arg.url).toContain('lang=en');
    expect(arg.text).toContain(SHARE_DISCLAIMER.en);
    expect(arg.title).toBe(TITLE);
  });

  it('copies the permalink and shows the localized confirmation when Web Share is absent', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: { writeText },
    });

    renderShare('en');
    fireEvent.click(screen.getByRole('button', { name: 'Share this series' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copiedUrl = writeText.mock.calls[0][0] as string;
    expect(copiedUrl).toContain(SERIES_ID);
    expect(copiedUrl).toContain('lang=en');
    // The localized "Link copied" confirmation appears.
    expect(await screen.findByText('Link copied')).toBeInTheDocument();
  });

  it('shows the localized Japanese confirmation and a ja-tagged permalink', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: { writeText },
    });

    renderShare('ja');
    fireEvent.click(screen.getByRole('button', { name: 'このシリーズを共有' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copiedUrl = writeText.mock.calls[0][0] as string;
    expect(copiedUrl).toContain('lang=ja');
    expect(await screen.findByText('リンクをコピーしました')).toBeInTheDocument();
  });

  it('reflects the active i18n language in the permalink (en vs ja)', async () => {
    const en = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      writable: true,
      value: en,
    });

    const { unmount } = renderShare('en');
    fireEvent.click(screen.getByRole('button', { name: 'Share this series' }));
    await waitFor(() => expect(en).toHaveBeenCalledTimes(1));
    expect((en.mock.calls[0][0] as { url: string }).url).toContain('lang=en');
    unmount();

    const ja = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      writable: true,
      value: ja,
    });
    renderShare('ja');
    fireEvent.click(screen.getByRole('button', { name: 'このシリーズを共有' }));
    await waitFor(() => expect(ja).toHaveBeenCalledTimes(1));
    expect((ja.mock.calls[0][0] as { url: string }).url).toContain('lang=ja');
  });

  it('falls back to a manual-copy input when neither Web Share nor clipboard is available', async () => {
    // Remove clipboard entirely for this case.
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: undefined,
    });

    renderShare('en');
    fireEvent.click(screen.getByRole('button', { name: 'Share this series' }));

    const input = (await screen.findByDisplayValue(
      /al-wc-1/,
    )) as HTMLInputElement;
    expect(input.value).toContain('lang=en');
    expect(input).toHaveAttribute('readonly');
  });
});
