const MAX_BODY_BYTES = 256 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HTTP_URL_PROTOCOLS = new Set(['https:', 'http:']);
const BODY_KEYS = new Set(['clientRequestId', 'title', 'ideaText', 'report', 'language', 'corpusSnapshot']);

type SaveDependencies = {
  allowedOrigins: Set<string>;
  authenticate: (token: string) => Promise<{ id?: string } | null>;
  persist: (values: Record<string, unknown>) => Promise<string>;
  now?: () => Date;
};

class RequestFailure extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function fail(status: number, code: string): never {
  throw new RequestFailure(status, code);
}

function json(data: unknown, status: number, origin: string | null, allowedOrigins: Set<string>, extra: HeadersInit = {}): Response {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    Vary: 'Origin',
    ...extra,
  });
  if (origin && allowedOrigins.has(origin)) headers.set('Access-Control-Allow-Origin', origin);
  return new Response(JSON.stringify(data), { status, headers });
}

function boundedString(value: unknown, min: number, max: number): string {
  if (typeof value !== 'string') fail(400, 'INVALID_REQUEST');
  const clean = value.trim();
  if (clean.length < min || clean.length > max) fail(400, 'INVALID_REQUEST');
  return clean;
}

function nullableString(value: unknown, max: number): string | null {
  if (value === null) return null;
  return boundedString(value, 1, max);
}

function arrayOfStrings(value: unknown, maxItems: number, maxLength: number, minItems = 0): string[] {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) fail(400, 'INVALID_REQUEST');
  return value.map((item) => boundedString(item, 1, maxLength));
}

function safeUrl(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  const raw = boundedString(value, 1, 2048);
  try {
    const parsed = new URL(raw);
    if (!HTTP_URL_PROTOCOLS.has(parsed.protocol)) fail(400, 'INVALID_REQUEST');
    return parsed.href;
  } catch (error) {
    if (error instanceof RequestFailure) throw error;
    return fail(400, 'INVALID_REQUEST');
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'INVALID_REQUEST');
  return value as Record<string, unknown>;
}

function canonicalIdeaProfile(value: unknown) {
  const input = object(value);
  return {
    summary: boundedString(input.summary, 1, 5000),
    topics: arrayOfStrings(input.topics, 5, 80),
    population: nullableString(input.population, 160),
    method: nullableString(input.method, 160),
    mechanisms: arrayOfStrings(input.mechanisms, 4, 80),
  };
}

function canonicalClosestWork(value: unknown) {
  if (!Array.isArray(value) || value.length > 5) fail(400, 'INVALID_REQUEST');
  return value.map((candidate) => {
    const item = object(candidate);
    return {
      paperId: boundedString(item.paperId, 1, 80),
      relationship: boundedString(item.relationship, 1, 120),
      overlapDimensions: arrayOfStrings(item.overlapDimensions, 4, 60),
      title: boundedString(item.title, 1, 500),
      conference: boundedString(item.conference, 1, 160),
      evidence: boundedString(item.evidence, 1, 600),
      sourceUrl: safeUrl(item.sourceUrl),
    };
  });
}

function canonicalAuthors(value: unknown) {
  if (!Array.isArray(value) || value.length > 30) fail(400, 'INVALID_REQUEST');
  return value.map((candidate) => {
    const author = object(candidate);
    return { name: boundedString(author.name, 1, 200) };
  });
}

function canonicalRelatedPapers(value: unknown) {
  if (!Array.isArray(value) || value.length > 20) fail(400, 'INVALID_REQUEST');
  return value.map((candidate, index) => {
    const item = object(candidate);
    const rank = Number(item.rank);
    const score = Number(item.score);
    const conferenceYear = Number(item.conferenceYear);
    if (!Number.isInteger(rank) || rank < 1 || rank > 20 || !Number.isFinite(score)) fail(400, 'INVALID_REQUEST');
    if (!Number.isInteger(conferenceYear) || conferenceYear < 1900 || conferenceYear > 2200) fail(400, 'INVALID_REQUEST');
    return {
      paperId: boundedString(item.paperId, 1, 80),
      rank,
      score,
      title: boundedString(item.title, 1, 500),
      authors: canonicalAuthors(item.authors),
      authorYearLabel: boundedString(item.authorYearLabel, 1, 200),
      conference: boundedString(item.conference, 1, 160),
      conferenceSlug: boundedString(item.conferenceSlug, 1, 80),
      conferenceYear,
      abstract: boundedString(item.abstract, 1, 20_000),
      keywords: arrayOfStrings(item.keywords, 30, 100),
      division: item.division === null ? null : boundedString(item.division, 1, 200),
      sessionTitle: item.sessionTitle === null ? null : boundedString(item.sessionTitle, 1, 500),
      sourceUrl: safeUrl(item.sourceUrl),
      _position: index,
    };
  }).map(({ _position: _ignored, ...paper }) => paper);
}

function canonicalEvidenceReferences(value: unknown) {
  if (!Array.isArray(value) || value.length > 4) fail(400, 'INVALID_REQUEST');
  return value.map((candidate) => {
    const item = object(candidate);
    return {
      paperId: boundedString(item.paperId, 1, 80),
      authorYearLabel: boundedString(item.authorYearLabel, 1, 200),
      title: boundedString(item.title, 1, 500),
      conference: boundedString(item.conference, 1, 160),
      sourceUrl: safeUrl(item.sourceUrl),
    };
  });
}

function canonicalInnovationPaths(value: unknown) {
  if (!Array.isArray(value) || value.length > 3) fail(400, 'INVALID_REQUEST');
  return value.map((candidate) => {
    const item = object(candidate);
    if (item.kind !== 'inference') fail(400, 'INVALID_REQUEST');
    return {
      title: boundedString(item.title, 1, 120),
      rationale: boundedString(item.rationale, 1, 260),
      evidencePaperIds: arrayOfStrings(item.evidencePaperIds, 4, 80),
      kind: 'inference',
      evidenceReferences: canonicalEvidenceReferences(item.evidenceReferences ?? []),
    };
  });
}

function canonicalReport(value: unknown) {
  const input = object(value);
  const report = {
    ideaProfile: canonicalIdeaProfile(input.ideaProfile),
    coverageNotice: boundedString(input.coverageNotice, 1, 260),
    closestWork: canonicalClosestWork(input.closestWork),
    relatedPapers: canonicalRelatedPapers(input.relatedPapers),
    innovationPaths: canonicalInnovationPaths(input.innovationPaths),
    recommendedNextSteps: arrayOfStrings(input.recommendedNextSteps, 4, 180),
    limitations: arrayOfStrings(input.limitations, 4, 180, 1),
  };
  if (new TextEncoder().encode(JSON.stringify(report)).byteLength > 65_536) fail(400, 'INVALID_REQUEST');
  return report;
}

function canonicalCorpus(value: unknown) {
  const input = object(value);
  const integer = (candidate: unknown) => {
    if (candidate === undefined || candidate === null) return null;
    const number = Number(candidate);
    if (!Number.isInteger(number) || number < 0) fail(400, 'INVALID_REQUEST');
    return number;
  };
  const conferences = Array.isArray(input.conferences) ? input.conferences : [];
  if (conferences.length > 20) fail(400, 'INVALID_REQUEST');
  return {
    ready: input.ready === true,
    paperCount: integer(input.paperCount),
    papersWithAbstract: integer(input.papersWithAbstract),
    embeddedPaperCount: integer(input.embeddedPaperCount),
    pendingEmbeddingCount: integer(input.pendingEmbeddingCount),
    failedEmbeddingCount: integer(input.failedEmbeddingCount),
    conferences: conferences.map((candidate) => {
      const item = object(candidate);
      return {
        slug: item.slug === undefined ? '' : boundedString(item.slug, 1, 80),
        name: item.name === undefined ? '' : boundedString(item.name, 1, 160),
        year: integer(item.year),
        papers: integer(item.papers),
      };
    }),
  };
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) fail(413, 'BODY_TOO_LARGE');
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength > MAX_BODY_BYTES) fail(413, 'BODY_TOO_LARGE');
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder().decode(bytes)); } catch { fail(400, 'INVALID_REQUEST'); }
  const body = object(parsed);
  if (Object.keys(body).some((key) => !BODY_KEYS.has(key))) fail(400, 'INVALID_REQUEST');
  return body;
}

function bearer(req: Request): string {
  const match = req.headers.get('authorization')?.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) fail(401, 'AUTH_REQUIRED');
  return match[1];
}

function validateInput(body: Record<string, unknown>) {
  const clientRequestId = boundedString(body.clientRequestId, 36, 36);
  if (!UUID_PATTERN.test(clientRequestId)) fail(400, 'INVALID_REQUEST');
  if (!['en', 'zh'].includes(String(body.language))) fail(400, 'INVALID_REQUEST');
  return {
    clientRequestId,
    title: boundedString(body.title, 1, 200),
    ideaText: boundedString(body.ideaText, 20, 5000),
    report: canonicalReport(body.report),
    language: String(body.language),
    corpusSnapshot: canonicalCorpus(body.corpusSnapshot),
  };
}

export async function handleAuthenticatedJsonRequest(req: Request, dependencies: SaveDependencies): Promise<Response> {
  const origin = req.headers.get('origin');
  const { allowedOrigins, authenticate, persist, now = () => new Date() } = dependencies;
  if (origin && !allowedOrigins.has(origin)) return json({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin not allowed.' } }, 403, null, allowedOrigins);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: json({}, 200, origin, allowedOrigins).headers });
  if (req.method !== 'POST') return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST for this endpoint.' } }, 405, origin, allowedOrigins, { Allow: 'POST, OPTIONS' });

  try {
    const token = bearer(req);
    const user = await authenticate(token);
    if (!user?.id || !UUID_PATTERN.test(user.id)) fail(401, 'AUTH_REQUIRED');
    const body = await readBody(req);
    const values = validateInput(body);
    const sessionId = await persist({
      target_user_id: user.id,
      client_request_id: values.clientRequestId,
      title: values.title,
      idea_text: values.ideaText,
      report: values.report,
      language: values.language,
      corpus_snapshot: values.corpusSnapshot,
    });
    if (!UUID_PATTERN.test(sessionId)) throw new Error('invalid_persistence_result');
    return json({ data: { sessionId, createdAt: now().toISOString() } }, 200, origin, allowedOrigins);
  } catch (error) {
    if (error instanceof RequestFailure) {
      const message = error.status === 401 ? 'Sign in to save this analysis.'
        : error.status === 413 ? 'The save request is too large.' : 'The save request is invalid.';
      return json({ error: { code: error.code, message } }, error.status, origin, allowedOrigins);
    }
    return json({ error: { code: 'SAVE_UNAVAILABLE', message: 'The analysis could not be saved. Please try again.' } }, 503, origin, allowedOrigins);
  }
}

export { MAX_BODY_BYTES };
