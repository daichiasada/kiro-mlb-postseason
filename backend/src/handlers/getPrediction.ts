/**
 * Prediction endpoint for a single series.
 *
 *   GET  /prediction?seriesId=...&season=YYYY
 *   POST /prediction            body: { "seriesId": "...", "season"?: YYYY }
 *
 * Returns a {@link Prediction} with the favorite, a clamped win probability, a
 * natural-language narrative (Bedrock, with deterministic fallback), and the
 * model id. Responses carry CORS headers.
 */
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { BracketService, SeriesNotFoundError } from '../service/bracketService.js';
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
    const prediction = await service.getPrediction(seriesId, season);
    return jsonResponse(200, prediction);
  } catch (error) {
    if (error instanceof SeriesNotFoundError) {
      return jsonResponse(404, { message: error.message });
    }
    return jsonResponse(500, { message: 'Failed to generate the prediction.' });
  }
};
