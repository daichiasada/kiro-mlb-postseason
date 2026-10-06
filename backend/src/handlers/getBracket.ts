/**
 * GET /bracket?season=YYYY
 *
 * Returns the aggregated postseason bracket for the requested season (default
 * 2024). Responses carry CORS headers so the SPA can call it directly.
 */
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { findIntegrityWarnings } from '@mlb/shared';
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
    // Data-integrity warnings are attached HERE, in the handler, rather than in
    // the pure aggregator (which stays side-effect free): a finished series or
    // decided game that still references a placeholder/TBD team is surfaced as a
    // non-blocking `integrityWarnings` array on the 200 response, and logged so
    // the condition is observable in the Lambda logs.
    const integrityWarnings = findIntegrityWarnings(bracket);
    if (integrityWarnings.length > 0) {
      const seriesIds = [...new Set(integrityWarnings.map((w) => w.seriesId))];
      console.warn(
        `[integrity] season ${season}: ${integrityWarnings.length} finished-context placeholder-team warning(s) across series ${seriesIds.join(', ')}`,
      );
    }
    return jsonResponse(200, { ...bracket, integrityWarnings });
  } catch {
    return jsonResponse(500, { message: 'Failed to load the postseason bracket.' });
  }
};
