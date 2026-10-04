/**
 * Prediction endpoint for a single series.
 *
 *   GET  /prediction?seriesId=...&season=YYYY
 *   POST /prediction            body: { "seriesId": "...", "season"?: YYYY }
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
import { jsonResponse, parseSeason } from './http.js';

const service = new BracketService();

interface PredictionBody {
  seriesId?: unknown;
  season?: unknown;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  let seriesId: string | undefined;
  let seasonRaw: string | undefined;

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
  } else {
    seriesId = event.queryStringParameters?.seriesId;
    seasonRaw = event.queryStringParameters?.season;
  }

  if (!seriesId || seriesId.trim() === '') {
    return jsonResponse(400, { message: 'seriesId is required.' });
  }

  const season = parseSeason(seasonRaw);
  if (season === undefined) {
    return jsonResponse(400, { message: 'Invalid season; expected a 4-digit year.' });
  }

  try {
    // getPrediction returns a discriminated union (mode: 'prediction' |
    // 'results' | 'upcoming'); all three are valid 200 responses the frontend
    // branches on. Results-only seasons never reach the predict/Bedrock path.
    const prediction = await service.getPrediction(seriesId, season);
    return jsonResponse(200, prediction);
  } catch {
    return jsonResponse(500, { message: 'Failed to generate the prediction.' });
  }
};
