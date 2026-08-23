import { corsHeaders, getCorpusStats, originAllowed } from '../_shared/idea-radar.ts';

function json(data: unknown, status: number, origin: string | null, cacheControl: string): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cacheControl,
      ...corsHeaders(origin, 'GET, OPTIONS'),
    },
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  if (!originAllowed(origin)) {
    return json({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin not allowed.' } }, 403, null, 'no-store');
  }
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin, 'GET, OPTIONS') });
  }
  if (req.method !== 'GET') {
    return json(
      { error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET for this endpoint.' } },
      405,
      origin,
      'no-store',
    );
  }

  try {
    const stats = await getCorpusStats();
    return json(
      {
        data: {
          ready: stats.ready,
          paperCount: stats.paperCount,
          papersWithAbstract: stats.papersWithAbstract,
          embeddedPaperCount: stats.embeddedPaperCount,
          pendingEmbeddingCount: stats.pendingEmbeddingCount,
          failedEmbeddingCount: stats.failedEmbeddingCount,
          conferences: stats.conferences,
        },
      },
      200,
      origin,
      'public, max-age=60',
    );
  } catch {
    return json(
      { error: { code: 'CORPUS_UNAVAILABLE', message: 'Corpus status is temporarily unavailable.' } },
      503,
      origin,
      'no-store',
    );
  }
});
