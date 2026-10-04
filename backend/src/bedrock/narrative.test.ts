import { describe, expect, it, vi } from 'vitest';
import type { Series } from '@mlb/shared';
import {
  buildPrompt,
  DEFAULT_MODEL_ID,
  fallbackNarrative,
  generateNarrative,
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

  it('defaults to the Anthropic Claude Haiku model id', () => {
    expect(DEFAULT_MODEL_ID).toBe('anthropic.claude-3-haiku-20240307-v1:0');
  });
});
