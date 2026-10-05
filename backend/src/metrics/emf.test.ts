import { describe, expect, it } from 'vitest';
import {
  METRIC_BEDROCK_INVOKE,
  METRIC_CACHE_HIT,
  METRIC_CACHE_MISS,
  METRIC_NAMESPACE,
  emitCacheMetric,
} from './emf.js';

/** Collects emitted lines into an array so tests can assert the shape. */
function arraySink() {
  const lines: string[] = [];
  return {
    sink: (line: string) => lines.push(line),
    lines,
  };
}

describe('emitCacheMetric', () => {
  it('emits exactly one EMF line for a cache hit (invoke count 0)', () => {
    const { sink, lines } = arraySink();

    emitCacheMetric({ cacheResult: 'hit', bedrockInvocations: 0, seriesId: 's1' }, sink);

    expect(lines).toHaveLength(1);
    const payload = JSON.parse(lines[0]!);
    expect(payload._aws.CloudWatchMetrics[0].Namespace).toBe(METRIC_NAMESPACE);
    const metricNames = payload._aws.CloudWatchMetrics[0].Metrics.map(
      (m: { Name: string }) => m.Name,
    );
    expect(metricNames).toContain(METRIC_CACHE_HIT);
    expect(metricNames).toContain(METRIC_BEDROCK_INVOKE);
    // No high-cardinality dimensions.
    expect(payload._aws.CloudWatchMetrics[0].Dimensions).toEqual([[]]);
    // Values and units.
    expect(payload[METRIC_CACHE_HIT]).toBe(1);
    expect(payload[METRIC_BEDROCK_INVOKE]).toBe(0);
    for (const m of payload._aws.CloudWatchMetrics[0].Metrics) {
      expect(m.Unit).toBe('Count');
    }
    // Series id is a plain property, never a dimension.
    expect(payload.seriesId).toBe('s1');
  });

  it('emits exactly one EMF line for a cache miss (invoke count 1)', () => {
    const { sink, lines } = arraySink();

    emitCacheMetric({ cacheResult: 'miss', bedrockInvocations: 1, seriesId: 's2' }, sink);

    expect(lines).toHaveLength(1);
    const payload = JSON.parse(lines[0]!);
    const metricNames = payload._aws.CloudWatchMetrics[0].Metrics.map(
      (m: { Name: string }) => m.Name,
    );
    expect(metricNames).toContain(METRIC_CACHE_MISS);
    expect(metricNames).not.toContain(METRIC_CACHE_HIT);
    expect(payload[METRIC_CACHE_MISS]).toBe(1);
    expect(payload[METRIC_BEDROCK_INVOKE]).toBe(1);
  });

  it('never throws when the sink throws', () => {
    const throwingSink = () => {
      throw new Error('sink down');
    };
    expect(() =>
      emitCacheMetric({ cacheResult: 'miss', bedrockInvocations: 1 }, throwingSink),
    ).not.toThrow();
  });
});
