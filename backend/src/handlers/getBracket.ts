/**
 * GET /bracket?season=YYYY
 *
 * Returns the aggregated postseason bracket for the requested season (default
 * 2024). Responses carry CORS headers so the SPA can call it directly.
 */
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { BracketService } from '../service/bracketService.js';
import { jsonResponse, parseSeason } from './http.js';

const service = new BracketService();

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const season = parseSeason(event.queryStringParameters?.season);
  if (season === undefined) {
    return jsonResponse(400, { message: 'Invalid season; expected a 4-digit year.' });
  }

  try {
    const bracket = await service.getBracket(season);
    return jsonResponse(200, bracket);
  } catch {
    return jsonResponse(500, { message: 'Failed to load the postseason bracket.' });
  }
};
