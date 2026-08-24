import { canTransition } from '../_shared/program-submission.ts';

const MAX_BODY_BYTES = 16 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BODY_KEYS = new Set(['submissionId', 'expectedStatus', 'decision', 'reason']);
const REJECTABLE_STATUSES = new Set(['submitted', 'under_review', 'approved', 'import_preview']);

type ReviewDependencies = {
  allowedOrigins: Set<string>;
  authenticate: (token: string) => Promise<{
    id?: string;
    appMetadata?: Record<string, unknown>;
  } | null>;
  transition: (token: string, values: Record<string, unknown>) => Promise<{
    id: string;
    status: string;
    reviewedAt: string;
  }>;
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

function headers(origin: string | null, allowedOrigins: Set<string>): Headers {
  const result = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    Vary: 'Origin',
  });
  if (origin && allowedOrigins.has(origin)) result.set('Access-Control-Allow-Origin', origin);
  return result;
}

function json(data: unknown, status: number, origin: string | null, allowedOrigins: Set<string>, extra?: HeadersInit): Response {
  const responseHeaders = headers(origin, allowedOrigins);
  if (extra) new Headers(extra).forEach((value, key) => responseHeaders.set(key, value));
  return new Response(JSON.stringify(data), { status, headers: responseHeaders });
}

function bearer(req: Request): string {
  const match = req.headers.get('authorization')?.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) fail(401, 'AUTH_REQUIRED');
  return match[1];
}

async function body(req: Request): Promise<Record<string, unknown>> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) fail(413, 'BODY_TOO_LARGE');
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength > MAX_BODY_BYTES) fail(413, 'BODY_TOO_LARGE');
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return fail(400, 'INVALID_REQUEST');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail(400, 'INVALID_REQUEST');
  const value = parsed as Record<string, unknown>;
  if (Object.keys(value).some((key) => !BODY_KEYS.has(key))) fail(400, 'INVALID_REQUEST');
  return value;
}

function normalizedReason(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') fail(400, 'INVALID_REQUEST');
  const reason = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (!reason || reason.length > 4000) fail(400, 'INVALID_REQUEST');
  return reason;
}

function transitionInput(input: Record<string, unknown>) {
  const submissionId = typeof input.submissionId === 'string' ? input.submissionId : '';
  if (!UUID_PATTERN.test(submissionId)) fail(400, 'INVALID_REQUEST');
  const expectedStatus = typeof input.expectedStatus === 'string' ? input.expectedStatus : '';
  const decision = typeof input.decision === 'string' ? input.decision : '';
  const reason = normalizedReason(input.reason);

  let nextStatus = '';
  if (decision === 'start_review' && expectedStatus === 'submitted') nextStatus = 'under_review';
  if (decision === 'approve' && expectedStatus === 'under_review') nextStatus = 'approved';
  if (decision === 'reject' && REJECTABLE_STATUSES.has(expectedStatus)) nextStatus = 'rejected';
  if (!nextStatus || !canTransition(expectedStatus, nextStatus)) fail(400, 'INVALID_TRANSITION');
  if (nextStatus === 'rejected' && !reason) fail(400, 'REJECTION_REASON_REQUIRED');

  return {
    submission_id: submissionId,
    expected_status: expectedStatus,
    next_status: nextStatus,
    reason,
  };
}

function safeRequestMessage(error: RequestFailure): string {
  if (error.status === 401) return 'Sign in with an administrator account.';
  if (error.status === 403) return 'Administrator access is required.';
  if (error.status === 413) return 'The review request is too large.';
  if (error.status === 405) return 'Use POST for this endpoint.';
  if (error.code === 'REJECTION_REASON_REQUIRED') return 'A rejection reason is required.';
  return 'The review request is invalid.';
}

export async function handleReviewProgramRequest(req: Request, dependencies: ReviewDependencies): Promise<Response> {
  const origin = req.headers.get('origin');
  const { allowedOrigins, authenticate, transition } = dependencies;
  if (origin && !allowedOrigins.has(origin)) {
    return json({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin not allowed.' } }, 403, null, allowedOrigins);
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(origin, allowedOrigins) });
  if (req.method !== 'POST') {
    return json(
      { error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST for this endpoint.' } },
      405,
      origin,
      allowedOrigins,
      { Allow: 'POST, OPTIONS' },
    );
  }

  try {
    const token = bearer(req);
    const user = await authenticate(token);
    if (!user?.id || !UUID_PATTERN.test(user.id)) fail(401, 'AUTH_REQUIRED');
    if (user.appMetadata?.role !== 'admin') fail(403, 'ADMIN_REQUIRED');
    const values = transitionInput(await body(req));
    const result = await transition(token, values);
    if (result.id !== values.submission_id
      || result.status !== values.next_status
      || !Number.isFinite(Date.parse(result.reviewedAt))) {
      throw new Error('invalid_transition_result');
    }
    return json({
      data: {
        submissionId: result.id,
        status: result.status,
        reviewedAt: result.reviewedAt,
      },
    }, 200, origin, allowedOrigins);
  } catch (error) {
    if (error instanceof RequestFailure) {
      return json({ error: { code: error.code, message: safeRequestMessage(error) } }, error.status, origin, allowedOrigins);
    }
    const databaseCode = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (databaseCode === '40001') {
      return json(
        { error: { code: 'SUBMISSION_CHANGED', message: 'This submission changed. Refresh the queue and try again.' } },
        409,
        origin,
        allowedOrigins,
      );
    }
    if (databaseCode === 'P0002') {
      return json(
        { error: { code: 'SUBMISSION_NOT_FOUND', message: 'This submission is no longer available.' } },
        404,
        origin,
        allowedOrigins,
      );
    }
    if (databaseCode === '42501' || databaseCode === '28000') {
      return json(
        { error: { code: 'ADMIN_REQUIRED', message: 'Administrator access is required.' } },
        403,
        origin,
        allowedOrigins,
      );
    }
    return json(
      { error: { code: 'REVIEW_UNAVAILABLE', message: 'The review could not be saved. Please try again.' } },
      503,
      origin,
      allowedOrigins,
    );
  }
}

const ALLOWED_ORIGINS = new Set([
  'https://mamingsuper.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

function edgeEnvironment(name: string): string {
  const deno = (globalThis as { Deno?: { env?: { get: (key: string) => string | undefined } } }).Deno;
  const value = deno?.env?.get(name)?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

let supabaseModule: Promise<typeof import('npm:@supabase/supabase-js@2.112.3')> | null = null;

async function productionHandler(req: Request): Promise<Response> {
  supabaseModule ??= import('npm:@supabase/supabase-js@2.112.3');
  const { createClient } = await supabaseModule;
  const supabaseUrl = edgeEnvironment('SUPABASE_URL').replace(/\/$/u, '');
  const deno = (globalThis as { Deno?: { env?: { get: (key: string) => string | undefined } } }).Deno;
  const publishableKey = deno?.env?.get('SUPABASE_PUBLISHABLE_KEY')?.trim() || edgeEnvironment('SUPABASE_ANON_KEY');

  function userClient(token: string) {
    return createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
  }

  return handleReviewProgramRequest(req, {
    allowedOrigins: ALLOWED_ORIGINS,
    async authenticate(token) {
      const { data, error } = await userClient(token).auth.getUser(token);
      if (error || !data.user) return null;
      return {
        id: data.user.id,
        appMetadata: data.user.app_metadata,
      };
    },
    async transition(token, values) {
      const { data, error } = await userClient(token).rpc('transition_program_submission', values);
      if (error) throw Object.assign(new Error('review_transition_failed'), { code: error.code });
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('review_transition_failed');
      return {
        id: String(data.id ?? ''),
        status: String(data.status ?? ''),
        reviewedAt: String(data.reviewed_at ?? ''),
      };
    },
  });
}

const edgeRuntime = (globalThis as { Deno?: { serve?: (handler: (req: Request) => Promise<Response>) => unknown } }).Deno;
if (edgeRuntime?.serve) edgeRuntime.serve(productionHandler);

export { MAX_BODY_BYTES };
