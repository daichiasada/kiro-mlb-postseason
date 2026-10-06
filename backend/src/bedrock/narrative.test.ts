import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_NARRATIVE_MODEL_ID,
  NARRATIVE_MODEL_OPTIONS,
  resolveModelId,
  type Series,
} from '@mlb/shared';
import { InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import {
  buildPrompt,
  DEFAULT_MODEL_ID,
  fallbackNarrative,
  generateNarrative,
  RealBedrockInvoker,
  strategyForModel,
  type BedrockInvoker,
} from './narrative.js';
import type { PredictionResult } from '../predict/model.js';

const series: Series = {
  id: '2024-ws-worldseries-119-147',
  round: 'World Series',
  league: 'WS',
  high: { teamId: 119, wins: 4 },
  low: { teamId: 147, wins: 1 },
  bestOf: 7,
  status: 'final',
  games: [],
};

const prediction: PredictionResult = {
  favoriteTeamId: 119,
  favoriteWinProbability: 0.9,
};

describe('buildPrompt', () => {
  it('includes team names, series score, favorite, and probability (EN)', () => {
    const prompt = buildPrompt(series, prediction, 'en');
    expect(prompt).toContain('Los Angeles Dodgers');
    expect(prompt).toContain('New York Yankees');
    expect(prompt).toContain('World Series');
    expect(prompt).toContain('90%');
    expect(prompt).toContain('best-of-7');
    // English instruction wording.
    expect(prompt).toContain('concise baseball analyst');
  });

  it('defaults to English when no language is supplied', () => {
    expect(buildPrompt(series, prediction)).toBe(buildPrompt(series, prediction, 'en'));
  });

  it('produces a Japanese prompt for language ja with identical team names/percent', () => {
    const prompt = buildPrompt(series, prediction, 'ja');
    // Localized instruction prose (contains Japanese characters).
    expect(prompt).toContain('野球アナリスト');
    expect(prompt).toContain('日本語');
    // Team club names stay in English per the i18n convention.
    expect(prompt).toContain('Los Angeles Dodgers');
    expect(prompt).toContain('New York Yankees');
    // Numeric percent is identical across languages.
    expect(prompt).toContain('90%');
    // No English instruction wording leaked into the JA prompt.
    expect(prompt).not.toContain('concise baseball analyst');
  });
});

describe('fallbackNarrative', () => {
  it('is English prose for language en', () => {
    const text = fallbackNarrative(series, prediction, 'en');
    expect(text).toContain('Los Angeles Dodgers');
    expect(text).toContain('New York Yankees');
    expect(text).toContain('90%');
    expect(text).toContain('favored to win');
  });

  it('is Japanese prose for language ja with identical team names/percent', () => {
    const text = fallbackNarrative(series, prediction, 'ja');
    // Localized surrounding prose.
    expect(text).toContain('有利と予測され');
    // Team club names and percent unchanged.
    expect(text).toContain('Los Angeles Dodgers');
    expect(text).toContain('New York Yankees');
    expect(text).toContain('90%');
    expect(text).not.toContain('favored to win');
  });
});

describe('generateNarrative', () => {
  it('returns the invoker output and model id on success', async () => {
    const invoke = vi.fn().mockResolvedValue('The Dodgers are rolling.');
    const invoker: BedrockInvoker = { invoke };

    const result = await generateNarrative(series, prediction, invoker, 'test-model');

    expect(result.narrative).toBe('The Dodgers are rolling.');
    expect(result.model).toBe('test-model');
    expect(invoke).toHaveBeenCalledTimes(1);
    const [modelId, prompt] = invoke.mock.calls[0]!;
    expect(modelId).toBe('test-model');
    expect(prompt).toContain('Los Angeles Dodgers');
  });

  it('passes an English prompt to the invoker for language en', async () => {
    const invoke = vi.fn().mockResolvedValue('ok');
    await generateNarrative(series, prediction, { invoke }, 'test-model', 'en');
    const [, prompt] = invoke.mock.calls[0]!;
    expect(prompt).toContain('concise baseball analyst');
    expect(prompt).not.toContain('野球アナリスト');
  });

  it('passes a Japanese prompt to the invoker for language ja', async () => {
    const invoke = vi.fn().mockResolvedValue('ok');
    await generateNarrative(series, prediction, { invoke }, 'test-model', 'ja');
    const [, prompt] = invoke.mock.calls[0]!;
    expect(prompt).toContain('野球アナリスト');
    expect(prompt).not.toContain('concise baseball analyst');
  });

  it('falls back to the English deterministic narrative when the invoker throws', async () => {
    const invoker: BedrockInvoker = {
      invoke: vi.fn().mockRejectedValue(new Error('bedrock unavailable')),
    };

    const result = await generateNarrative(series, prediction, invoker, 'test-model', 'en');

    expect(result.narrative).toBe(fallbackNarrative(series, prediction, 'en'));
    expect(result.model).toContain('fallback');
    expect(result.narrative).toContain('Los Angeles Dodgers');
    expect(result.narrative).toContain('favored to win');
  });

  it('falls back to the Japanese deterministic narrative for language ja', async () => {
    const invoker: BedrockInvoker = {
      invoke: vi.fn().mockRejectedValue(new Error('bedrock unavailable')),
    };

    const result = await generateNarrative(series, prediction, invoker, 'test-model', 'ja');

    expect(result.narrative).toBe(fallbackNarrative(series, prediction, 'ja'));
    expect(result.model).toContain('fallback');
    expect(result.narrative).toContain('有利と予測され');
  });

  it('defaults to the shared Amazon Nova default model id', () => {
    expect(DEFAULT_MODEL_ID).toBe(DEFAULT_NARRATIVE_MODEL_ID);
    expect(DEFAULT_MODEL_ID).toBe('us.amazon.nova-lite-v1:0');
  });
});

describe('shared model allowlist (resolveModelId)', () => {
  it('exposes exactly the three Nova ids plus the Claude id', () => {
    const ids = NARRATIVE_MODEL_OPTIONS.map((o) => o.id);
    expect(ids).toEqual([
      'us.amazon.nova-micro-v1:0',
      'us.amazon.nova-lite-v1:0',
      'us.amazon.nova-pro-v1:0',
      'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    ]);
  });

  it('passes through a known Amazon model id', () => {
    expect(resolveModelId('us.amazon.nova-pro-v1:0')).toBe('us.amazon.nova-pro-v1:0');
  });

  it('passes through the known Claude model id', () => {
    expect(resolveModelId('us.anthropic.claude-haiku-4-5-20251001-v1:0')).toBe(
      'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    );
  });

  it('falls back to the Amazon default for an unknown id', () => {
    expect(resolveModelId('made-up-model')).toBe('us.amazon.nova-lite-v1:0');
  });

  it('falls back to the default for an undefined id', () => {
    expect(resolveModelId(undefined)).toBe('us.amazon.nova-lite-v1:0');
  });
});

describe('strategyForModel provider selection', () => {
  // The adapter is driven by the shared allowlist `provider` discriminator, not
  // just an id substring, so a future third-provider entry can never be
  // silently mis-shaped as Nova. We identify the chosen strategy by the request
  // body it produces: Nova carries `schemaVersion`/`inferenceConfig`; Anthropic
  // carries `anthropic_version`.
  function isNovaBody(modelId: string): boolean {
    const body = JSON.parse(strategyForModel(modelId).buildBody('p')) as {
      schemaVersion?: string;
      inferenceConfig?: unknown;
      anthropic_version?: string;
    };
    return (
      body.schemaVersion === 'messages-v1' &&
      body.inferenceConfig !== undefined &&
      body.anthropic_version === undefined
    );
  }

  function isAnthropicBody(modelId: string): boolean {
    const body = JSON.parse(strategyForModel(modelId).buildBody('p')) as {
      anthropic_version?: string;
      inferenceConfig?: unknown;
    };
    return body.anthropic_version === 'bedrock-2023-05-31' && body.inferenceConfig === undefined;
  }

  it('uses the Nova strategy for every Amazon allowlist id', () => {
    const amazonIds = NARRATIVE_MODEL_OPTIONS.filter((o) => o.provider === 'amazon').map(
      (o) => o.id,
    );
    expect(amazonIds.length).toBeGreaterThan(0);
    for (const id of amazonIds) {
      expect(isNovaBody(id)).toBe(true);
    }
  });

  it('uses the Anthropic strategy for the Claude allowlist id', () => {
    const anthropicIds = NARRATIVE_MODEL_OPTIONS.filter((o) => o.provider === 'anthropic').map(
      (o) => o.id,
    );
    expect(anthropicIds.length).toBeGreaterThan(0);
    for (const id of anthropicIds) {
      expect(isAnthropicBody(id)).toBe(true);
    }
  });

  it('resolves provider from the allowlist discriminator, not the id substring', () => {
    // Every allowlist id maps to the strategy its declared `provider` names,
    // proving selection is driven by `provider` and not an incidental substring.
    for (const option of NARRATIVE_MODEL_OPTIONS) {
      if (option.provider === 'amazon') {
        expect(isNovaBody(option.id)).toBe(true);
      } else {
        expect(isAnthropicBody(option.id)).toBe(true);
      }
    }
  });

  it('falls back to the Nova strategy for a non-allowlisted, unrecognized id', () => {
    // A raw BEDROCK_MODEL_ID override outside the allowlist with no recognizable
    // provider substring still resolves to the default family (Nova).
    expect(isNovaBody('made-up-model')).toBe(true);
  });
});

describe('RealBedrockInvoker request/response shaping (ISSUE-2)', () => {
  // Guards the real InvokeModel body/parse path that higher-level tests only
  // exercise through a mocked `invoke`. The BedrockRuntimeClient is injected
  // and its send() stubbed so no live AWS call is made.
  function anthropicResponseBody(text: string | string[]): { body: Uint8Array } {
    const content = (Array.isArray(text) ? text : [text]).map((t) => ({
      type: 'text',
      text: t,
    }));
    const payload = JSON.stringify({ id: 'msg_1', type: 'message', content });
    return { body: new TextEncoder().encode(payload) };
  }

  function novaResponseBody(text: string | string[]): { body: Uint8Array } {
    const content = (Array.isArray(text) ? text : [text]).map((t) => ({ text: t }));
    const payload = JSON.stringify({ output: { message: { role: 'assistant', content } } });
    return { body: new TextEncoder().encode(payload) };
  }

  it('sends an Anthropic messages body and parses content[].text for a Claude id', async () => {
    const send = vi.fn().mockResolvedValue(anthropicResponseBody('The Dodgers are rolling.'));
    const client = { send } as unknown as import('@aws-sdk/client-bedrock-runtime').BedrockRuntimeClient;
    const invoker = new RealBedrockInvoker(client);

    const text = await invoker.invoke(
      'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      'Why is LA favored?',
    );

    // (b) response parsing: content[].text is extracted.
    expect(text).toBe('The Dodgers are rolling.');

    // (a) request shaping: a single InvokeModelCommand with the Anthropic body.
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]![0] as InvokeModelCommand;
    expect(command).toBeInstanceOf(InvokeModelCommand);
    expect(command.input.modelId).toBe('us.anthropic.claude-haiku-4-5-20251001-v1:0');
    expect(command.input.contentType).toBe('application/json');
    expect(command.input.accept).toBe('application/json');

    const sentBody = JSON.parse(command.input.body as string) as {
      anthropic_version: string;
      max_tokens: number;
      temperature: number;
      messages: Array<{ role: string; content: Array<{ type: string; text: string }> }>;
    };
    expect(sentBody.anthropic_version).toBe('bedrock-2023-05-31');
    expect(sentBody.max_tokens).toBe(300);
    expect(typeof sentBody.temperature).toBe('number');
    expect(sentBody.messages).toHaveLength(1);
    expect(sentBody.messages[0]!.role).toBe('user');
    expect(sentBody.messages[0]!.content[0]!.type).toBe('text');
    expect(sentBody.messages[0]!.content[0]!.text).toBe('Why is LA favored?');
  });

  it('sends an Amazon Nova messages/inferenceConfig body and parses output.message.content[].text', async () => {
    const send = vi.fn().mockResolvedValue(novaResponseBody('The Dodgers are rolling.'));
    const client = { send } as unknown as import('@aws-sdk/client-bedrock-runtime').BedrockRuntimeClient;
    const invoker = new RealBedrockInvoker(client);

    const text = await invoker.invoke('us.amazon.nova-lite-v1:0', 'Why is LA favored?');

    // (b) response parsing: output.message.content[].text is extracted.
    expect(text).toBe('The Dodgers are rolling.');

    // (a) request shaping: the Nova messages/inferenceConfig body (NOT Anthropic).
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]![0] as InvokeModelCommand;
    expect(command).toBeInstanceOf(InvokeModelCommand);
    expect(command.input.modelId).toBe('us.amazon.nova-lite-v1:0');
    expect(command.input.contentType).toBe('application/json');

    const sentBody = JSON.parse(command.input.body as string) as {
      schemaVersion?: string;
      messages: Array<{ role: string; content: Array<{ text: string }> }>;
      inferenceConfig: { maxTokens: number; temperature: number };
      anthropic_version?: string;
    };
    expect(sentBody.anthropic_version).toBeUndefined();
    // Nova's native InvokeModel request schema requires this discriminator;
    // pinning it here so the contract can never silently regress again.
    expect(sentBody.schemaVersion).toBe('messages-v1');
    expect(sentBody.inferenceConfig.maxTokens).toBe(300);
    expect(typeof sentBody.inferenceConfig.temperature).toBe('number');
    expect(sentBody.messages).toHaveLength(1);
    expect(sentBody.messages[0]!.role).toBe('user');
    expect(sentBody.messages[0]!.content[0]!.text).toBe('Why is LA favored?');
    // Nova content blocks have no `type` field.
    expect(
      (sentBody.messages[0]!.content[0] as { type?: string }).type,
    ).toBeUndefined();
  });

  it('concatenates multiple text blocks from an Anthropic response', async () => {
    const send = vi.fn().mockResolvedValue(anthropicResponseBody(['Part one. ', 'Part two.']));
    const client = { send } as unknown as import('@aws-sdk/client-bedrock-runtime').BedrockRuntimeClient;
    const invoker = new RealBedrockInvoker(client);

    const text = await invoker.invoke('us.anthropic.claude-haiku-4-5-20251001-v1:0', 'prompt');

    expect(text).toBe('Part one. Part two.');
  });

  it('concatenates multiple text blocks from a Nova response', async () => {
    const send = vi.fn().mockResolvedValue(novaResponseBody(['Part one. ', 'Part two.']));
    const client = { send } as unknown as import('@aws-sdk/client-bedrock-runtime').BedrockRuntimeClient;
    const invoker = new RealBedrockInvoker(client);

    const text = await invoker.invoke('us.amazon.nova-micro-v1:0', 'prompt');

    expect(text).toBe('Part one. Part two.');
  });

  it('throws when an Anthropic response contains no text content', async () => {
    const send = vi.fn().mockResolvedValue({
      body: new TextEncoder().encode(JSON.stringify({ content: [] })),
    });
    const client = { send } as unknown as import('@aws-sdk/client-bedrock-runtime').BedrockRuntimeClient;
    const invoker = new RealBedrockInvoker(client);

    await expect(
      invoker.invoke('us.anthropic.claude-haiku-4-5-20251001-v1:0', 'prompt'),
    ).rejects.toThrow(/no text content/);
  });

  it('throws when a Nova response contains no text content', async () => {
    const send = vi.fn().mockResolvedValue({
      body: new TextEncoder().encode(JSON.stringify({ output: { message: { content: [] } } })),
    });
    const client = { send } as unknown as import('@aws-sdk/client-bedrock-runtime').BedrockRuntimeClient;
    const invoker = new RealBedrockInvoker(client);

    await expect(invoker.invoke('us.amazon.nova-lite-v1:0', 'prompt')).rejects.toThrow(
      /no text content/,
    );
  });
});
