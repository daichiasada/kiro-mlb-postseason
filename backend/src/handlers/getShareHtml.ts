/**
 * GET /share?season=YYYY&seriesId=...&lang=en|ja
 *
 * Returns a crawler-readable HTML document (via the shared pure
 * {@link buildShareHtml}) carrying per-series OpenGraph/Twitter meta tags
 * (incl. the localized disclaimer in og:description) plus a redirect that sends
 * a human visitor into the SPA deep link. A social crawler reads the static
 * meta tags; a browser is redirected by the meta-refresh + inline
 * location.replace the builder emits.
 *
 * Caching: the generated HTML is cached in DynamoDB under the SAME keyed cache
 * as the OG image but with a `SHARE#` prefix (see {@link shareCacheKey}) so the
 * SVG and HTML payloads for one series never collide. A cache hit returns the
 * stored HTML WITHOUT rebuilding.
 *
 * Origin resolution: the SPA/canonical/OG-image URLs need the public site
 * origin. We prefer the `SITE_ORIGIN` env var injected by CDK (the CloudFront
 * domain, the one true public origin). When it is absent (local runs) we fall
 * back to deriving it from the request's forwarded headers (X-Forwarded-Proto +
 * Host), and finally to a localhost default. We deliberately route by a
 * dedicated `/share` path rather than User-Agent sniffing.
 *
 * Contract: a missing/blank `seriesId` returns HTTP 400; an unknown series
 * returns HTTP 404; success is HTTP 200 `text/html`. No Bedrock.
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from 'aws-lambda';
import {
  buildOgImageUrl,
  buildSeriesPermalink,
  buildShareHtml,
  DEFAULT_NARRATIVE_LANGUAGE,
  type ShareLang,
} from '@mlb/shared';
import { BracketService } from '../service/bracketService.js';
import { shareCacheKey } from '../service/ogCacheKey.js';
import { DynamoBracketStore, type BracketStore } from '../store/dynamo.js';
import { jsonResponse, parseLanguage, parseSeason, parseSeriesId, rawResponse } from './http.js';

const HTML_CONTENT_TYPE = 'text/html; charset=utf-8';
const DEFAULT_ORIGIN = 'http://localhost:5173';

const service = new BracketService();
const store: BracketStore = new DynamoBracketStore();

/**
 * Resolves the public site origin. Preference order:
 *   1. `SITE_ORIGIN` env var (the CloudFront domain injected by CDK).
 *   2. The request's forwarded headers (`X-Forwarded-Proto` + `Host`).
 *   3. A localhost default (local runs).
 * Header names are matched case-insensitively since API Gateway may lowercase.
 */
function resolveOrigin(event: APIGatewayProxyEventV2): string {
  const envOrigin = process.env.SITE_ORIGIN?.trim();
  if (envOrigin) {
    return envOrigin.replace(/\/+$/, '');
  }

  const headers = event.headers ?? {};
  const header = (name: string): string | undefined => {
    const lower = name.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === lower && typeof value === 'string' && value.trim() !== '') {
        return value.trim();
      }
    }
    return undefined;
  };

  const host = header('host');
  if (host) {
    const proto = header('x-forwarded-proto') ?? 'https';
    return `${proto}://${host}`;
  }

  return DEFAULT_ORIGIN;
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const seriesId = parseSeriesId(event.queryStringParameters?.seriesId);
  if (seriesId === undefined) {
    return jsonResponse(400, { message: 'seriesId is required.' });
  }

  const season = parseSeason(event.queryStringParameters?.season);
  if (season === undefined) {
    return jsonResponse(400, { message: 'Invalid season; expected a 4-digit year.' });
  }

  const lang: ShareLang =
    parseLanguage(event.queryStringParameters?.lang) ?? DEFAULT_NARRATIVE_LANGUAGE;

  try {
    const resolved = await service.getSeriesWithBracket(seriesId, season);
    if (!resolved) {
      return jsonResponse(404, { message: `Series not found: ${seriesId}` });
    }

    const { series } = resolved;
    const cacheKey = shareCacheKey({
      seriesId,
      highWins: series.high.wins,
      lowWins: series.low.wins,
      lang,
    });

    // Cache hit: return the stored HTML WITHOUT rebuilding it.
    const cached = await store.getCachedOgImage(cacheKey);
    if (cached) {
      return rawResponse(200, cached, HTML_CONTENT_TYPE);
    }

    // Build the SPA deep link (canonical) and the OG image URL off the resolved
    // public origin, then render the crawler HTML via the shared builder.
    const origin = resolveOrigin(event);
    const canonicalUrl = buildSeriesPermalink({ origin, season, seriesId, lang });
    const ogImageUrl = buildOgImageUrl({ apiBase: origin, season, seriesId, lang });
    const html = buildShareHtml({
      series,
      season,
      lang,
      appUrl: canonicalUrl,
      ogImageUrl,
      canonicalUrl,
    });

    await store.putCachedOgImage(cacheKey, html);
    return rawResponse(200, html, HTML_CONTENT_TYPE);
  } catch {
    return jsonResponse(500, { message: 'Failed to build the share page.' });
  }
};
