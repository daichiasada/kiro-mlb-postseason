/**
 * CloudWatch Embedded Metric Format (EMF) helpers for the prediction cache.
 *
 * EMF lets a Lambda emit CloudWatch metrics by writing a single structured JSON
 * line to stdout; the CloudWatch agent extracts the metrics from the log group
 * automatically. This avoids a `cloudwatch:PutMetricData` IAM grant and an
 * extra AWS SDK call on the request path.
 *
 * The envelope lists the namespace and metric names under `_aws.CloudWatchMetrics`
 * and keeps dimensions EMPTY on purpose: high-cardinality values such as the
 * series id would explode the metric cost, so the series id (when present) is
 * carried as a plain log property, not a dimension.
 *
 * The emitter is side-effect-only (it writes one line to a sink) and the sink
 * is injectable so unit tests can assert the emitted shape without spying on
 * the real console.
 */

/** CloudWatch namespace for every metric emitted by this module. */
export const METRIC_NAMESPACE = 'MlbPostseason/Prediction';

/** Metric name emitted (value 1) on a prediction cache hit. */
export const METRIC_CACHE_HIT = 'PredictionCacheHit';

/** Metric name emitted (value 1) on a prediction cache miss. */
export const METRIC_CACHE_MISS = 'PredictionCacheMiss';

/** Metric name carrying the number of Bedrock InvokeModel attempts (0 or 1). */
export const METRIC_BEDROCK_INVOKE = 'BedrockInvokeCount';

/** A sink that receives one EMF JSON line. Defaults to {@link console.log}. */
export type MetricSink = (line: string) => void;

export interface CacheMetricInput {
  /** Whether the request was served from cache (`hit`) or computed (`miss`). */
  cacheResult: 'hit' | 'miss';
  /** Bedrock InvokeModel attempts for the request (0 on a hit, 1 on a miss). */
  bedrockInvocations: number;
  /** Optional series id, carried as a log property (never a dimension). */
  seriesId?: string;
}

/**
 * Builds the EMF JSON object for a cache metric emission. Exposed for tests and
 * for callers that want the object without emitting it.
 */
export function buildCacheMetricPayload(input: CacheMetricInput): Record<string, unknown> {
  const { cacheResult, bedrockInvocations, seriesId } = input;
  const hitMetricName = cacheResult === 'hit' ? METRIC_CACHE_HIT : METRIC_CACHE_MISS;

  const payload: Record<string, unknown> = {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: METRIC_NAMESPACE,
          // No dimensions on purpose: keep metrics low-cardinality.
          Dimensions: [[]],
          Metrics: [
            { Name: hitMetricName, Unit: 'Count' },
            { Name: METRIC_BEDROCK_INVOKE, Unit: 'Count' },
          ],
        },
      ],
    },
    [hitMetricName]: 1,
    [METRIC_BEDROCK_INVOKE]: bedrockInvocations,
  };

  if (seriesId !== undefined) {
    payload.seriesId = seriesId;
  }

  return payload;
}

/**
 * Emits ONE EMF JSON line describing a prediction cache hit or miss and the
 * accompanying Bedrock InvokeModel count. Never throws: a logging failure must
 * not break the response, so any sink error is swallowed.
 *
 * @param input       the cache result and invoke count to record
 * @param sink        where to write the line (defaults to console.log)
 */
export function emitCacheMetric(
  input: CacheMetricInput,
  sink: MetricSink = (line) => console.log(line),
): void {
  try {
    sink(JSON.stringify(buildCacheMetricPayload(input)));
  } catch {
    // Metrics are best-effort; never let a logging failure break the request.
  }
}
