/**
 * GET /game?gamePk=NNN
 *
 * Returns the per-game detail (inning-by-inning line score, totals, pitcher
 * decisions, venue/state, optional recap highlight) for a game as a
 * {@link GameDetailResponse} discriminated union with HTTP 200:
 *   - `status: 'ok'` with the full detail.
 *   - `status: 'unavailable'` the documented fallback (still HTTP 200) when the
 *     upstream MLB fetch fails, so the frontend can keep showing the final
 *     score. This mirrors the prediction handler's union-at-200 approach.
 *
 * An invalid/missing `gamePk` returns HTTP 400. Responses carry CORS headers.
 */
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { BracketService } from '../service/bracketService.js';
import { jsonResponse, parseGamePk } from './http.js';

const service = new BracketService();

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const gamePk = parseGamePk(event.queryStringParameters?.gamePk);
  if (gamePk === undefined) {
    return jsonResponse(400, { message: 'Invalid gamePk; expected a positive integer.' });
  }

  try {
    // getGameDetail returns a discriminated union ('ok' | 'unavailable'); both
    // are valid 200 responses the frontend branches on. The 'unavailable'
    // variant is the graceful fallback contract, not an error.
    const detail = await service.getGameDetail(gamePk);
    return jsonResponse(200, detail);
  } catch {
    return jsonResponse(500, { message: 'Failed to load the game detail.' });
  }
};
