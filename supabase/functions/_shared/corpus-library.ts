import { corsHeaders, jsonResponse, originAllowed } from './idea-radar.ts';

export type CorpusLibraryQuery = {
  query: string;
  conferenceSlug: string;
  page: number;
  limit: 20;
  offset: number;
};

type LibraryDependencies = {
  rateLimit(req: Request): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
  browse(query: CorpusLibraryQuery): Promise<unknown>;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function cleanText(value: unknown, max = 100_000): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function cleanPaper(value: unknown) {
  const paper = record(value);
  const sourceUrl = cleanText(paper.sourceUrl, 2048);
  return {
    id: cleanText(paper.id, 64),
    title: cleanText(paper.title, 1000),
    abstract: cleanText(paper.abstract),
    authors: Array.isArray(paper.authors) ? paper.authors.slice(0, 100) : [],
    conferenceSlug: cleanText(paper.conferenceSlug, 100),
    conferenceName: cleanText(paper.conferenceName, 200),
    conferenceYear: Number(paper.conferenceYear ?? 0),
    division: cleanText(paper.division, 500),
    keywords: Array.isArray(paper.keywords) ? paper.keywords.map((item) => cleanText(item, 200)).filter(Boolean).slice(0, 50) : [],
    sourceUrl: /^https:\/\//i.test(sourceUrl) ? sourceUrl : '',
  };
}

export function parseCorpusLibraryQuery(url: URL): CorpusLibraryQuery {
  const query = (url.searchParams.get('q') ?? '').trim();
  const conferenceSlug = (url.searchParams.get('conference') ?? '').trim().toLowerCase();
  const pageText = url.searchParams.get('page') ?? '1';
  if (query.length > 200
    || (conferenceSlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(conferenceSlug))
    || !/^\d+$/.test(pageText)) throw new TypeError('invalid_library_query');
  const page = Number(pageText);
  if (!Number.isInteger(page) || page < 1 || page > 500) throw new TypeError('invalid_library_query');
  return { query, conferenceSlug, page, limit: 20, offset: (page - 1) * 20 };
}

export async function handleCorpusLibraryRequest(req: Request, dependencies: LibraryDependencies): Promise<Response> {
  const origin = req.headers.get('origin');
  if (!originAllowed(origin)) return jsonResponse({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin not allowed.' } }, 403, null);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin, 'GET, OPTIONS') });
  if (req.method !== 'GET') return jsonResponse({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET for this endpoint.' } }, 405, origin, 'no-store', { Allow: 'GET, OPTIONS' });
  try {
    const query = parseCorpusLibraryQuery(new URL(req.url));
    const limit = await dependencies.rateLimit(req);
    if (!limit.allowed) {
      return jsonResponse(
        { error: { code: 'RATE_LIMITED', message: 'Too many library requests. Try again shortly.' } },
        429,
        origin,
        'no-store',
        { 'Retry-After': String(limit.retryAfterSeconds) },
      );
    }
    const raw = record(await dependencies.browse(query));
    const papers = (Array.isArray(raw.papers) ? raw.papers : []).map(cleanPaper);
    return jsonResponse({
      data: {
        papers,
        total: Math.max(0, Number(raw.total ?? 0)),
        page: query.page,
        limit: query.limit,
      },
    }, 200, origin, 'public, max-age=60, stale-while-revalidate=120');
  } catch (error) {
    if (error instanceof TypeError && error.message === 'invalid_library_query') {
      return jsonResponse({ error: { code: 'INVALID_QUERY', message: 'Use a shorter search, a valid conference, and page 1–500.' } }, 400, origin);
    }
    return jsonResponse({ error: { code: 'LIBRARY_UNAVAILABLE', message: 'The conference library is temporarily unavailable.' } }, 503, origin);
  }
}
