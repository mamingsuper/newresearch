const ALLOWED_ORIGINS = new Set([
  'https://mamingsuper.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

function serverKey(): string {
  return env('SUPABASE_SERVICE_ROLE_KEY');
}

async function rpc(name: string): Promise<unknown> {
  const key = serverKey();
  const response = await fetch(`${env('SUPABASE_URL').replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: '{}',
  });
  if (!response.ok) throw new Error(`supabase_${name}_${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export function originAllowed(origin: string | null): boolean {
  return origin === null || ALLOWED_ORIGINS.has(origin);
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    Vary: 'Origin',
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export async function getCorpusStats() {
  const raw = await rpc('get_corpus_stats');
  const candidate = Array.isArray(raw)
    ? (raw[0]?.get_corpus_stats ?? raw[0])
    : ((raw as Record<string, unknown> | null)?.get_corpus_stats ?? raw);
  if (!candidate || typeof candidate !== 'object') throw new Error('invalid_corpus_stats');
  const stats = candidate as Record<string, unknown>;
  return {
    ready: stats.ready === true,
    paperCount: Number(stats.paperCount ?? 0),
    papersWithAbstract: Number(stats.papersWithAbstract ?? 0),
    embeddedPaperCount: Number(stats.embeddedPaperCount ?? 0),
    pendingEmbeddingCount: Number(stats.pendingEmbeddingCount ?? 0),
    failedEmbeddingCount: Number(stats.failedEmbeddingCount ?? 0),
    conferences: Array.isArray(stats.conferences) ? stats.conferences : [],
  };
}
