import { validateFileDescriptor, validateSubmission } from '../_shared/program-submission.ts';

const MAX_BODY_BYTES = 64 * 1024;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BODY_KEYS = new Set([
  'conferenceName',
  'acronym',
  'year',
  'discipline',
  'officialConferenceUrl',
  'notes',
  'rightsAttested',
  'kind',
  'programUrl',
  'storagePath',
  'fileName',
  'fileSizeBytes',
  'mimeType',
  'sha256',
]);

type StorageInspection = {
  path?: string;
  name: string;
  size: number;
  contentType: string;
  bytes: Uint8Array;
};

type PersistedSubmission = {
  id: string;
  status: string;
  submittedAt: string;
};

type SubmitDependencies = {
  allowedOrigins: Set<string>;
  authenticate: (token: string) => Promise<{ id?: string } | null>;
  inspectStorage: (path: string) => Promise<StorageInspection | null>;
  persist: (values: Record<string, unknown>) => Promise<PersistedSubmission>;
  randomUUID?: () => string;
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

function responseHeaders(origin: string | null, allowedOrigins: Set<string>): Headers {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    Vary: 'Origin',
  });
  if (origin && allowedOrigins.has(origin)) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

function json(data: unknown, status: number, origin: string | null, allowedOrigins: Set<string>, extra?: HeadersInit): Response {
  const headers = responseHeaders(origin, allowedOrigins);
  if (extra) new Headers(extra).forEach((value, key) => headers.set(key, value));
  return new Response(JSON.stringify(data), { status, headers });
}

function bearer(req: Request): string {
  const match = req.headers.get('authorization')?.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) fail(401, 'AUTH_REQUIRED');
  return match[1];
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
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
  const body = parsed as Record<string, unknown>;
  if (Object.keys(body).some((key) => !BODY_KEYS.has(key))) fail(400, 'INVALID_REQUEST');
  return body;
}

function conferenceSlug(acronym: string, year: number): string {
  const base = acronym.normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '');
  if (!base) fail(400, 'INVALID_REQUEST');
  return `${base}-${year}`;
}

async function contentSha256(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function verifyFile(
  submission: Extract<ReturnType<typeof validateSubmission>, { kind: 'file' }>,
  ownerId: string,
  inspectStorage: SubmitDependencies['inspectStorage'],
): Promise<string> {
  const pathParts = submission.storagePath.split('/');
  const submissionId = pathParts[1] ?? '';
  const expectedPath = `${ownerId}/${submissionId}/${submission.fileName}`;
  if (!UUID_PATTERN.test(submissionId) || submission.storagePath !== expectedPath) fail(400, 'INVALID_FILE');

  const stored = await inspectStorage(submission.storagePath);
  if (!stored
    || stored.path && stored.path !== submission.storagePath
    || stored.name !== submission.fileName
    || stored.size !== submission.fileSizeBytes
    || stored.contentType !== submission.mimeType
    || !(stored.bytes instanceof Uint8Array)
    || stored.bytes.byteLength !== stored.size) {
    fail(400, 'INVALID_FILE');
  }

  try {
    validateFileDescriptor({
      name: stored.name,
      size: stored.size,
      declaredMime: stored.contentType,
      magicBytes: stored.bytes.slice(0, Math.min(stored.bytes.byteLength, 1024)),
    });
  } catch (error) {
    if (error instanceof TypeError) fail(400, 'INVALID_FILE');
    throw error;
  }
  if (await contentSha256(stored.bytes) !== submission.sha256) fail(400, 'INVALID_FILE');
  return submissionId;
}

function requestMessage(error: RequestFailure): string {
  if (error.status === 401) return 'Sign in to submit a conference program.';
  if (error.status === 413) return 'The submission request is too large.';
  if (error.status === 403) return 'Origin not allowed.';
  if (error.status === 405) return 'Use POST for this endpoint.';
  return 'The conference program submission is invalid.';
}

export async function handleSubmitProgramRequest(req: Request, dependencies: SubmitDependencies): Promise<Response> {
  const origin = req.headers.get('origin');
  const { allowedOrigins, authenticate, inspectStorage, persist, randomUUID = () => globalThis.crypto.randomUUID() } = dependencies;
  if (origin && !allowedOrigins.has(origin)) {
    return json({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin not allowed.' } }, 403, null, allowedOrigins);
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: responseHeaders(origin, allowedOrigins) });
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
    const user = await authenticate(bearer(req));
    if (!user?.id || !UUID_PATTERN.test(user.id)) fail(401, 'AUTH_REQUIRED');
    const body = await readBody(req);
    let submission: ReturnType<typeof validateSubmission>;
    try {
      submission = validateSubmission(body);
    } catch (error) {
      if (error instanceof TypeError) fail(400, 'INVALID_REQUEST');
      throw error;
    }
    const submissionId = submission.kind === 'file'
      ? await verifyFile(submission, user.id, inspectStorage)
      : randomUUID();
    if (!UUID_PATTERN.test(submissionId)) throw new Error('invalid_generated_submission_id');

    const persisted = await persist({
      target_submission_id: submissionId,
      target_user_id: user.id,
      target_conference_slug: conferenceSlug(submission.acronym, submission.year),
      target_conference_name: submission.conferenceName,
      target_conference_acronym: submission.acronym,
      target_conference_year: submission.year,
      target_discipline: submission.discipline,
      target_official_conference_url: submission.officialConferenceUrl,
      target_notes: submission.notes,
      target_submission_kind: submission.kind,
      target_program_url: submission.kind === 'url' ? submission.programUrl : null,
      target_storage_path: submission.kind === 'file' ? submission.storagePath : null,
      target_file_name: submission.kind === 'file' ? submission.fileName : null,
      target_file_size_bytes: submission.kind === 'file' ? submission.fileSizeBytes : null,
      target_mime_type: submission.kind === 'file' ? submission.mimeType : null,
      target_content_sha256: submission.kind === 'file' ? submission.sha256 : null,
    });
    if (persisted.id !== submissionId
      || persisted.status !== 'submitted'
      || !Number.isFinite(Date.parse(persisted.submittedAt))) {
      throw new Error('invalid_persistence_result');
    }
    return json({
      data: {
        submissionId: persisted.id,
        status: 'submitted',
        submittedAt: persisted.submittedAt,
      },
    }, 201, origin, allowedOrigins);
  } catch (error) {
    if (error instanceof RequestFailure) {
      return json({ error: { code: error.code, message: requestMessage(error) } }, error.status, origin, allowedOrigins);
    }
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      return json(
        { error: { code: 'DUPLICATE_SUBMISSION', message: 'This conference program has already been submitted.' } },
        409,
        origin,
        allowedOrigins,
      );
    }
    return json(
      { error: { code: 'SUBMISSION_UNAVAILABLE', message: 'The conference program could not be submitted. Please try again.' } },
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
  const secretKey = deno?.env?.get('SUPABASE_SECRET_KEY')?.trim() || edgeEnvironment('SUPABASE_SERVICE_ROLE_KEY');
  const serviceClient = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  return handleSubmitProgramRequest(req, {
    allowedOrigins: ALLOWED_ORIGINS,
    async authenticate(token) {
      const userClient = createClient(supabaseUrl, publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data, error } = await userClient.auth.getUser(token);
      if (error) return null;
      return data.user ? { id: data.user.id } : null;
    },
    async inspectStorage(path) {
      const bucket = serviceClient.storage.from('program-submissions');
      const { data: info, error: infoError } = await bucket.info(path);
      if (infoError || !info) return null;
      const size = Number(info.size ?? info.metadata?.size);
      const contentType = String(info.contentType ?? info.metadata?.mimetype ?? '');
      if (!Number.isSafeInteger(size) || size < 1 || size > MAX_FILE_BYTES) fail(400, 'INVALID_FILE');
      const { data: blob, error: downloadError } = await bucket.download(path);
      if (downloadError || !blob) throw new Error('storage_download_failed');
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return {
        path,
        name: path.split('/').at(-1) ?? '',
        size,
        contentType,
        bytes,
      };
    },
    async persist(values) {
      const { data, error } = await serviceClient.rpc('create_program_submission', values);
      if (error) throw Object.assign(new Error('submission_persistence_failed'), { code: error.code });
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('submission_persistence_failed');
      return {
        id: String(data.id ?? ''),
        status: String(data.status ?? ''),
        submittedAt: String(data.submittedAt ?? ''),
      };
    },
  });
}

const edgeRuntime = (globalThis as { Deno?: { serve?: (handler: (req: Request) => Promise<Response>) => unknown } }).Deno;
if (edgeRuntime?.serve) edgeRuntime.serve(productionHandler);

export { MAX_BODY_BYTES };
