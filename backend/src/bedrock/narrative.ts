/**
 * Amazon Bedrock narrative generation for a series prediction.
 *
 * The Bedrock call is isolated behind the {@link BedrockInvoker} interface so
 * tests can supply a mock. Any Bedrock failure (throttling, access, parsing)
 * falls back to a deterministic templated narrative, so the prediction endpoint
 * never hard-fails on the AI path.
 */
import { TEAMS, type Series } from '@mlb/shared';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import type { PredictionResult } from '../predict/model.js';

/**
 * Default Anthropic Claude model id; overridable via BEDROCK_MODEL_ID.
 * Uses the cross-region inference-profile id (prefix `us.`) because the
 * current-generation Claude Haiku model is only invocable on-demand through
 * an inference profile.
 */
export const DEFAULT_MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

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

/** Builds the Anthropic prompt describing the matchup and the computed call. */
export function buildPrompt(series: Series, prediction: PredictionResult): string {
  const high = teamLabel(series.high.teamId);
  const low = teamLabel(series.low.teamId);
  const favorite = teamLabel(prediction.favoriteTeamId);
  const pct = Math.round(prediction.favoriteWinProbability * 100);

  return [
    `You are a concise baseball analyst for an MLB postseason summary site.`,
    `Series round: ${series.round} (${series.league}).`,
    `Matchup: ${high} (${series.high.wins} wins) vs ${low} (${series.low.wins} wins), best-of-${series.bestOf}, status ${series.status}.`,
    `Our model favors ${favorite} with a ${pct}% chance to win the series.`,
    `Write a concise 2-3 sentence prediction narrative explaining why ${favorite} is favored. Do not invent specific statistics.`,
  ].join('\n');
}

/** Deterministic fallback narrative used when Bedrock is unavailable. */
export function fallbackNarrative(series: Series, prediction: PredictionResult): string {
  const favorite = teamLabel(prediction.favoriteTeamId);
  const underdogId =
    prediction.favoriteTeamId === series.high.teamId
      ? series.low.teamId
      : series.high.teamId;
  const underdog = teamLabel(underdogId);
  const pct = Math.round(prediction.favoriteWinProbability * 100);
  return (
    `${favorite} are favored to win this ${series.round} series over ${underdog}, ` +
    `with an estimated ${pct}% chance based on current series results and season form. ` +
    `The ${series.status === 'final' ? 'completed' : 'ongoing'} best-of-${series.bestOf} matchup ` +
    `still comes down to execution on the mound and timely hitting.`
  );
}

/** Production invoker backed by the real Bedrock Runtime client. */
export class RealBedrockInvoker implements BedrockInvoker {
  private readonly client: BedrockRuntimeClient;

  constructor(client?: BedrockRuntimeClient) {
    this.client = client ?? new BedrockRuntimeClient({});
  }

  async invoke(modelId: string, prompt: string): Promise<string> {
    const command = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 300,
        temperature: 0.5,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      }),
    });

    const response = await this.client.send(command);
    const raw = new TextDecoder().decode(response.body as Uint8Array);
    const parsed = JSON.parse(raw) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = (parsed.content ?? [])
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('')
      .trim();

    if (!text) {
      throw new Error('Bedrock response contained no text content');
    }
    return text;
  }
}

/**
 * Generates a narrative for a series prediction. On any error from the invoker
 * the deterministic {@link fallbackNarrative} is returned instead of throwing.
 */
export async function generateNarrative(
  series: Series,
  prediction: PredictionResult,
  invoker: BedrockInvoker = new RealBedrockInvoker(),
  modelId: string = process.env.BEDROCK_MODEL_ID ?? DEFAULT_MODEL_ID,
): Promise<NarrativeResult> {
  const prompt = buildPrompt(series, prediction);
  try {
    const narrative = await invoker.invoke(modelId, prompt);
    return { narrative, model: modelId };
  } catch (error) {
    console.error('Bedrock narrative generation failed; using fallback', {
      modelId,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    });
    return { narrative: fallbackNarrative(series, prediction), model: `${modelId} (fallback)` };
  }
}
