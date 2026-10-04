import { describe, expect, it, vi } from 'vitest';
import type { Series } from '@mlb/shared';
import { InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import {
  buildPrompt,
  DEFAULT_MODEL_ID,
  fallbackNarrative,
  generateNarrative,
  RealBedrockInvoker,
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
  it('includes team names, series score, favorite, and probability', () => {
    const prompt = buildPrompt(series, prediction);
    expect(prompt).toContain('Los Angeles Dodgers');
    expect(prompt).toContain('New York Yankees');
    expect(prompt).toContain('World Series');
    expect(prompt).toContain('90%');
    expect(prompt).toContain('best-of-7');
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

  it('falls back to a deterministic narrative when the invoker throws', async () => {
    const invoker: BedrockInvoker = {
      invoke: vi.fn().mockRejectedValue(new Error('bedrock unavailable')),
    };

    const result = await generateNarrative(series, prediction, invoker, 'test-model');

    expect(result.narrative).toBe(fallbackNarrative(series, prediction));
    expect(result.model).toContain('fallback');
    expect(result.narrative).toContain('Los Angeles Dodgers');
  });

  it('defaults to the Anthropic Claude Haiku cross-region inference profile', () => {
    expect(DEFAULT_MODEL_ID).toBe('us.anthropic.claude-haiku-4-5-20251001-v1:0');
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

  it('sends an Anthropic messages body and parses content[].text', async () => {
    const send = vi.fn().mockResolvedValue(anthropicResponseBody('The Dodgers are rolling.'));
    const client = { send } as unknown as import('@aws-sdk/client-bedrock-runtime').BedrockRuntimeClient;
    const invoker = new RealBedrockInvoker(client);

    const text = await invoker.invoke('anthropic.test-model', 'Why is LA favored?');

    // (b) response parsing: content[].text is extracted.
    expect(text).toBe('The Dodgers are rolling.');

    // (a) request shaping: a single InvokeModelCommand with the Anthropic body.
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]![0] as InvokeModelCommand;
    expect(command).toBeInstanceOf(InvokeModelCommand);
    expect(command.input.modelId).toBe('anthropic.test-model');
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

  it('concatenates multiple text blocks from the response', async () => {
    const send = vi.fn().mockResolvedValue(anthropicResponseBody(['Part one. ', 'Part two.']));
    const client = { send } as unknown as import('@aws-sdk/client-bedrock-runtime').BedrockRuntimeClient;
    const invoker = new RealBedrockInvoker(client);

    const text = await invoker.invoke('anthropic.test-model', 'prompt');

    expect(text).toBe('Part one. Part two.');
  });

  it('throws when the response contains no text content', async () => {
    const send = vi.fn().mockResolvedValue({
      body: new TextEncoder().encode(JSON.stringify({ content: [] })),
    });
    const client = { send } as unknown as import('@aws-sdk/client-bedrock-runtime').BedrockRuntimeClient;
    const invoker = new RealBedrockInvoker(client);

    await expect(invoker.invoke('anthropic.test-model', 'prompt')).rejects.toThrow(
      /no text content/,
    );
  });
});
