/**
 * Amazon Bedrock narrative generation for a series prediction.
 *
 * The Bedrock call is isolated behind the {@link BedrockInvoker} interface so
 * tests can supply a mock. Any Bedrock failure (throttling, access, parsing)
 * falls back to a deterministic templated narrative, so the prediction endpoint
 * never hard-fails on the AI path.
 *
 * The invoker is model-aware: the request body and response parsing differ per
 * provider (Anthropic Claude vs Amazon Nova), so {@link RealBedrockInvoker}
 * selects a per-provider strategy from the model id. The prompt and the
 * deterministic fallback are language-aware (EN/JA).
 */
import {
  DEFAULT_NARRATIVE_MODEL_ID,
  DEFAULT_NARRATIVE_LANGUAGE,
  NARRATIVE_MODEL_OPTIONS,
  TEAMS,
  type NarrativeLanguage,
  type NarrativeModelProvider,
  type Series,
} from '@mlb/shared';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import type { PredictionResult } from '../predict/model.js';

/**
 * Default Bedrock model id; overridable via BEDROCK_MODEL_ID. Sourced from the
 * shared {@link DEFAULT_NARRATIVE_MODEL_ID} (an Amazon Nova inference profile)
 * so the API and UI share one default. Uses a cross-region inference-profile id
 * (prefix `us.`) because the current-generation models are invoked on-demand
 * through an inference profile.
 */
export const DEFAULT_MODEL_ID = DEFAULT_NARRATIVE_MODEL_ID;

const MAX_TOKENS = 300;
const TEMPERATURE = 0.5;

export interface NarrativeResult {
  narrative: string;
  model: string;
}

/** Minimal interface over the Bedrock InvokeModel call, for mockability. */
export interface BedrockInvoker {
  /** Returns the generated completion text for the given prompt. */
  invoke(modelId: string, prompt: string): Promise<string>;
}

function teamLabel(teamId: number): string {
  return TEAMS[teamId]?.name ?? `Team ${teamId}`;
}

/**
 * Builds the prompt describing the matchup and the computed call, localized to
 * the requested language. Team club names stay in English per the i18n
 * convention; the surrounding instructions/sentence are localized. The numeric
 * percentage and team names are identical across languages.
 */
export function buildPrompt(
  series: Series,
  prediction: PredictionResult,
  language: NarrativeLanguage = DEFAULT_NARRATIVE_LANGUAGE,
): string {
  const high = teamLabel(series.high.teamId);
  const low = teamLabel(series.low.teamId);
  const favorite = teamLabel(prediction.favoriteTeamId);
  const pct = Math.round(prediction.favoriteWinProbability * 100);

  if (language === 'ja') {
    return [
      `あなたはMLBポストシーズンまとめサイトの、簡潔な野球アナリストです。`,
      `シリーズ: ${series.round}（${series.league}）。`,
      `対戦: ${high}（${series.high.wins}勝）対 ${low}（${series.low.wins}勝）、${series.bestOf}戦制、状態 ${series.status}。`,
      `我々のモデルは ${favorite} を ${pct}% の勝率で有利と予測しています。`,
      `${favorite} が有利な理由を説明する、簡潔な2〜3文の日本語の予測コメントを書いてください。具体的な統計を創作しないでください。`,
    ].join('\n');
  }

  return [
    `You are a concise baseball analyst for an MLB postseason summary site.`,
    `Series round: ${series.round} (${series.league}).`,
    `Matchup: ${high} (${series.high.wins} wins) vs ${low} (${series.low.wins} wins), best-of-${series.bestOf}, status ${series.status}.`,
    `Our model favors ${favorite} with a ${pct}% chance to win the series.`,
    `Write a concise 2-3 sentence prediction narrative explaining why ${favorite} is favored. Do not invent specific statistics.`,
  ].join('\n');
}

/**
 * Deterministic fallback narrative used when Bedrock is unavailable, localized
 * to the requested language. Team club names and the numeric percentage are
 * identical across languages; only the surrounding prose is localized.
 */
export function fallbackNarrative(
  series: Series,
  prediction: PredictionResult,
  language: NarrativeLanguage = DEFAULT_NARRATIVE_LANGUAGE,
): string {
  const favorite = teamLabel(prediction.favoriteTeamId);
  const underdogId =
    prediction.favoriteTeamId === series.high.teamId
      ? series.low.teamId
      : series.high.teamId;
  const underdog = teamLabel(underdogId);
  const pct = Math.round(prediction.favoriteWinProbability * 100);

  if (language === 'ja') {
    const finished = series.status === 'final' ? '終了した' : '進行中の';
    return (
      `${favorite} はこの ${series.round} シリーズで ${underdog} を相手に有利と予測され、` +
      `現在のシリーズ結果とシーズンの調子から推定勝率は ${pct}% です。` +
      `${finished}${series.bestOf}戦制のこの対戦は、` +
      `最終的にはマウンドでの投球とここぞという場面での打撃にかかっています。`
    );
  }

  return (
    `${favorite} are favored to win this ${series.round} series over ${underdog}, ` +
    `with an estimated ${pct}% chance based on current series results and season form. ` +
    `The ${series.status === 'final' ? 'completed' : 'ongoing'} best-of-${series.bestOf} matchup ` +
    `still comes down to execution on the mound and timely hitting.`
  );
}

/**
 * Per-provider adapter: shapes the InvokeModel request body for a prompt and
 * parses the completion text from the raw response JSON. The request/response
 * JSON differs by provider, so the invoker selects a strategy from the model id.
 */
interface ModelStrategy {
  buildBody(prompt: string): string;
  parseText(raw: string): string;
}

/** Anthropic Claude messages API shape (anthropic_version + content[].text). */
const anthropicStrategy: ModelStrategy = {
  buildBody(prompt: string): string {
    return JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    });
  },
  parseText(raw: string): string {
    const parsed = JSON.parse(raw) as {
      content?: Array<{ type: string; text?: string }>;
    };
    return (parsed.content ?? [])
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('')
      .trim();
  },
};

/**
 * Amazon Nova messages shape for InvokeModel: a Converse-style `messages` array
 * with `inferenceConfig`, and a response of
 * `{ output: { message: { content: [{ text }] } } }`.
 */
const amazonNovaStrategy: ModelStrategy = {
  buildBody(prompt: string): string {
    return JSON.stringify({
      // Nova's native InvokeModel request schema REQUIRES this top-level
      // discriminator as a sibling to `messages`/`inferenceConfig`; without it
      // Nova rejects the call and every Nova selection silently degrades to the
      // deterministic fallback.
      schemaVersion: 'messages-v1',
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      inferenceConfig: { maxTokens: MAX_TOKENS, temperature: TEMPERATURE },
    });
  },
  parseText(raw: string): string {
    const parsed = JSON.parse(raw) as {
      output?: { message?: { content?: Array<{ text?: string }> } };
    };
    return (parsed.output?.message?.content ?? [])
      .filter((block) => typeof block.text === 'string')
      .map((block) => block.text)
      .join('')
      .trim();
  },
};

/** Maps a provider discriminator to its request/response adapter. */
const STRATEGY_BY_PROVIDER: Record<NarrativeModelProvider, ModelStrategy> = {
  anthropic: anthropicStrategy,
  amazon: amazonNovaStrategy,
};

/** Looks up the shared allowlist `provider` for a model id, if the id is known. */
const PROVIDER_BY_MODEL_ID: ReadonlyMap<string, NarrativeModelProvider> = new Map(
  NARRATIVE_MODEL_OPTIONS.map((option) => [option.id, option.provider]),
);

/**
 * Resolves the provider from the model id using the id-substring heuristic.
 * Only called for ids absent from the shared allowlist (the allowlist's
 * `provider` discriminator is the primary source of truth); callers reach here
 * only via `BEDROCK_MODEL_ID` overrides outside the allowlist.
 */
function providerFromIdHeuristic(modelId: string): NarrativeModelProvider | undefined {
  if (modelId.includes('anthropic.')) {
    return 'anthropic';
  }
  if (modelId.includes('amazon.')) {
    return 'amazon';
  }
  return undefined;
}

/**
 * Selects the request/response adapter for a model id. Resolution is driven by
 * the shared {@link NARRATIVE_MODEL_OPTIONS} `provider` discriminator (the
 * single source of truth), so a future third-provider allowlist entry can never
 * be silently mis-shaped as Nova: it would resolve to that provider and, with
 * no adapter registered here, throw loudly rather than degrade. For ids not in
 * the allowlist (e.g. a raw `BEDROCK_MODEL_ID` override) the id-substring
 * heuristic applies; a wholly unrecognized provider defaults to the Amazon Nova
 * strategy (the default model family), matching the shared default resolution.
 */
export function strategyForModel(modelId: string): ModelStrategy {
  const provider = PROVIDER_BY_MODEL_ID.get(modelId) ?? providerFromIdHeuristic(modelId);
  if (provider === undefined) {
    return amazonNovaStrategy;
  }
  const strategy = STRATEGY_BY_PROVIDER[provider];
  if (strategy === undefined) {
    // An allowlist entry declared a provider with no adapter here. Fail loudly
    // so the mismatch is observable rather than silently mis-shaped as Nova.
    throw new Error(`No Bedrock request/response adapter for provider '${provider}'`);
  }
  return strategy;
}

/** Production invoker backed by the real Bedrock Runtime client. */
export class RealBedrockInvoker implements BedrockInvoker {
  private readonly client: BedrockRuntimeClient;

  constructor(client?: BedrockRuntimeClient) {
    this.client = client ?? new BedrockRuntimeClient({});
  }

  async invoke(modelId: string, prompt: string): Promise<string> {
    const strategy = strategyForModel(modelId);
    const command = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: strategy.buildBody(prompt),
    });

    const response = await this.client.send(command);
    const raw = new TextDecoder().decode(response.body as Uint8Array);
    const text = strategy.parseText(raw);

    if (!text) {
      throw new Error('Bedrock response contained no text content');
    }
    return text;
  }
}

/**
 * Generates a narrative for a series prediction. On any error from the invoker
 * the deterministic {@link fallbackNarrative} is returned instead of throwing.
 * The narrative is produced in `language` (EN/JA) for both the Bedrock prompt
 * and the fallback.
 */
export async function generateNarrative(
  series: Series,
  prediction: PredictionResult,
  invoker: BedrockInvoker = new RealBedrockInvoker(),
  modelId: string = process.env.BEDROCK_MODEL_ID ?? DEFAULT_MODEL_ID,
  language: NarrativeLanguage = DEFAULT_NARRATIVE_LANGUAGE,
): Promise<NarrativeResult> {
  const prompt = buildPrompt(series, prediction, language);
  try {
    const narrative = await invoker.invoke(modelId, prompt);
    return { narrative, model: modelId };
  } catch (error) {
    console.error('Bedrock narrative generation failed; using fallback', {
      modelId,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    });
    return {
      narrative: fallbackNarrative(series, prediction, language),
      model: `${modelId} (fallback)`,
    };
  }
}
