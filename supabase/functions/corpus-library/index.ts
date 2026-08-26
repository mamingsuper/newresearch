import { handleCorpusLibraryRequest } from '../_shared/corpus-library.ts';
import { rpc } from '../_shared/idea-radar.ts';
import { networkRateLimitKey } from '../_shared/request-identity.ts';

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

Deno.serve((req) => handleCorpusLibraryRequest(req, {
  rateLimit: async (request) => {
    const clientHash = await networkRateLimitKey(request, env('RATE_LIMIT_HMAC_KEY'));
    const raw = await rpc('consume_beta_rate_limit', { client_hash: clientHash });
    const row = Array.isArray(raw) ? raw[0] : raw;
    const result = row && typeof row === 'object' ? row as Record<string, unknown> : {};
    return {
      allowed: result.allowed === true,
      retryAfterSeconds: Math.max(0, Number(result.retry_after_seconds ?? 0)),
    };
  },
  browse: async (query) => rpc('browse_corpus_papers', {
    target_conference_slug: query.conferenceSlug || null,
    target_query: query.query || null,
    target_offset: query.offset,
    target_limit: query.limit,
  }),
}));
