/**
 * Shared contracts for the AI narrative: the output language and the
 * selectable Amazon Bedrock model allowlist.
 *
 * These values are a domain contract shared across the boundary (mirroring how
 * the accuracy bounds live in `@mlb/shared`): the backend resolves the request
 * `model`/`lang` against this single source of truth, and the frontend offers
 * exactly these model options and sends its UI language. Keeping them here means
 * a future change to the supported languages or model list cannot silently
 * desynchronize the API from the UI.
 *
 * This module is intentionally dependency-free.
 */

/**
 * Language of the generated prediction narrative. Matches the frontend UI
 * languages ('en' | 'ja'); the domain/contract type lives here in `@mlb/shared`.
 */
export type NarrativeLanguage = 'en' | 'ja';

/**
 * Default narrative language used when a request omits `lang`. 'en' is chosen
 * so a missing language is well-defined server-side; the frontend always sends
 * its current UI language, so the default is only hit by bare API callers.
 */
export const DEFAULT_NARRATIVE_LANGUAGE: NarrativeLanguage = 'en';

/** Provider family of a selectable Bedrock model. */
export type NarrativeModelProvider = 'amazon' | 'anthropic';

/** A selectable Bedrock model option, shared by the API and the UI selector. */
export interface NarrativeModelOption {
  /** Bedrock model/inference-profile id passed to InvokeModel. */
  id: string;
  /** Provider family; selects the request/response adapter on the backend. */
  provider: NarrativeModelProvider;
  /** Human-readable label for the UI selector. */
  label: string;
}

/**
 * Ordered list of selectable models. Amazon Nova (micro/lite/pro) are the
 * Amazon-family text options; Amazon Titan has no text-generation model in
 * us-east-1 (embeddings only). The existing Anthropic Claude Haiku profile is
 * kept available as a non-default option.
 *
 * Ids are the `us.*` cross-region inference-profile ids verified in us-east-1
 * via `aws bedrock list-foundation-models`/`list-inference-profiles`, matching
 * the Claude default pattern and the infra IAM (inference-profile/*).
 */
export const NARRATIVE_MODEL_OPTIONS: readonly NarrativeModelOption[] = [
  { id: 'us.amazon.nova-micro-v1:0', provider: 'amazon', label: 'Amazon Nova Micro' },
  { id: 'us.amazon.nova-lite-v1:0', provider: 'amazon', label: 'Amazon Nova Lite' },
  { id: 'us.amazon.nova-pro-v1:0', provider: 'amazon', label: 'Amazon Nova Pro' },
  {
    id: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    provider: 'anthropic',
    label: 'Anthropic Claude Haiku 4.5',
  },
] as const;

/**
 * Default model. An Amazon-family model per Issue #13 task 3; Nova Lite
 * balances quality, latency, and cost and supports on-demand + inference
 * profile invocation.
 */
export const DEFAULT_NARRATIVE_MODEL_ID = 'us.amazon.nova-lite-v1:0';

/** Set of allowlisted model ids, derived from {@link NARRATIVE_MODEL_OPTIONS}. */
const ALLOWED_MODEL_IDS: ReadonlySet<string> = new Set(
  NARRATIVE_MODEL_OPTIONS.map((option) => option.id),
);

/**
 * Server-side allowlist validation: returns `id` when it is a known selectable
 * model, otherwise the default. Never throws, so an unknown/missing model from
 * a lenient request simply falls back to the default.
 */
export function resolveModelId(id?: string): string {
  if (id !== undefined && ALLOWED_MODEL_IDS.has(id)) {
    return id;
  }
  return DEFAULT_NARRATIVE_MODEL_ID;
}
