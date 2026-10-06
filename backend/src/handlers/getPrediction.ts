/**
 * Prediction endpoint for a single series.
 *
 *   GET  /prediction?seriesId=...&season=YYYY&accuracy=0..1&lang=en|ja&model=<id>
 *   POST /prediction            body: { "seriesId": "...", "season"?: YYYY,
 *                                       "accuracy"?: 0..1, "language"?|"lang"?: "en"|"ja",
 *                                       "model"?: "<bedrock-model-id>" }
 *
 * `lang`/`model` are optional and lenient: a missing or unknown value falls back
 * to the service default (and the shared model allowlist); neither returns 400.
 *
 * Returns a {@link PredictionResponse} discriminated union with HTTP 200:
 *   - `mode: 'prediction'` for a current-season, in-progress series: the
 *     favorite, a clamped win probability, a natural-language narrative
 *     (Bedrock, with deterministic fallback), and the model id.
 *   - `mode: 'results'` for a completed, results-only season (< CURRENT_YEAR):
 *     a documented message, with no predict/Bedrock call.
 *   - `mode: 'upcoming'` for a current-season series that is not resolvable yet
 *     or has not started.
 * Responses carry CORS headers.
 */
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { BracketService } from '../service/bracketService.js';
import {
  jsonResponse,
  parseAccuracy,
  parseLanguage,
  parseModelId,
  parseSeason,
} from './http.js';

const service = new BracketService();

interface PredictionBody {
  seriesId?: unknown;
  season?: unknown;
  accuracy?: unknown;
  language?: unknown;
  lang?: unknown;
  model?: unknown;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  let seriesId: string | undefined;
  let seasonRaw: string | undefined;
  let accuracyRaw: string | number | undefined;
  let languageRaw: string | undefined;
  let modelRaw: string | undefined;

  if (event.requestContext.http.method === 'POST') {
    let parsed: PredictionBody = {};
    if (event.body) {
      try {
        parsed = JSON.parse(event.body) as PredictionBody;
      } catch {
        return jsonResponse(400, { message: 'Request body must be valid JSON.' });
      }
    }
    if (typeof parsed.seriesId === 'string') seriesId = parsed.seriesId;
    if (typeof parsed.season === 'number') seasonRaw = String(parsed.season);
    else if (typeof parsed.season === 'string') seasonRaw = parsed.season;
    if (typeof parsed.accuracy === 'number' || typeof parsed.accuracy === 'string') {
      accuracyRaw = parsed.accuracy;
    }
    // Accept either `language` or `lang` in the POST body.
    if (typeof parsed.language === 'string') languageRaw = parsed.language;
    else if (typeof parsed.lang === 'string') languageRaw = parsed.lang;
    if (typeof parsed.model === 'string') modelRaw = parsed.model;
  } else {
    seriesId = event.queryStringParameters?.seriesId;
    seasonRaw = event.queryStringParameters?.season;
    accuracyRaw = event.queryStringParameters?.accuracy;
    languageRaw = event.queryStringParameters?.lang;
    modelRaw = event.queryStringParameters?.model;
  }

  if (!seriesId || seriesId.trim() === '') {
    return jsonResponse(400, { message: 'seriesId is required.' });
  }

  const season = parseSeason(seasonRaw);
  if (season === undefined) {
    return jsonResponse(400, { message: 'Invalid season; expected a 4-digit year.' });
  }

  // Optional best-effort tuning knob; left undefined when missing/invalid so
  // the model default applies. The model clamps it into its supported range.
  const accuracy = parseAccuracy(accuracyRaw);

  // Optional, lenient narrative controls: a missing/unknown language or model
  // is left undefined so the service default (and allowlist) applies. Neither
  // ever produces a 400.
  const language = parseLanguage(languageRaw);
  const model = parseModelId(modelRaw);

  try {
    // getPrediction returns a discriminated union (mode: 'prediction' |
    // 'results' | 'upcoming'); all three are valid 200 responses the frontend
    // branches on. Results-only seasons never reach the predict/Bedrock path.
    const prediction = await service.getPrediction(
      seriesId,
      season,
      accuracy,
      language,
      model,
    );
    return jsonResponse(200, prediction);
  } catch {
    return jsonResponse(500, { message: 'Failed to generate the prediction.' });
  }
};
