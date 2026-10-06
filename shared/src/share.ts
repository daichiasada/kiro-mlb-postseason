/**
 * Shared contracts for the social-share feature (Issue #21): the supported
 * share languages and the localized disclaimer that MUST accompany every
 * shared prediction (OG image footer, meta description, and the SPA share
 * text) so predictions are never presented as betting advice.
 *
 * This module is intentionally dependency-free.
 */

/**
 * Language of shared artifacts (permalink `?lang=`, OG image, meta HTML).
 * Mirrors the frontend UI languages and the {@link
 * import('./narrative.js').NarrativeLanguage} contract.
 */
export type ShareLang = 'en' | 'ja';

/**
 * Localized disclaimer reminding readers that predictions are reference values
 * only. Reused by the OG SVG builder, the crawler meta-HTML builder, and the
 * frontend share text so the wording cannot desynchronize.
 */
export const SHARE_DISCLAIMER: Record<ShareLang, string> = {
  en: 'Predictions are reference values, not betting advice.',
  ja: '予測は参考値であり、賭けの助言ではありません。',
};
