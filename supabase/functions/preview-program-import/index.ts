import { parseProgram } from '../_shared/program-parser.ts';
import { REMOTE_FETCH_LIMITS, validateRemoteUrl } from '../_shared/program-submission.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Deps = { authenticate(token: string): Promise<{ id: string; role: string } | null>; loadSubmission(id: string): Promise<Record<string, unknown> | null>; loadSource(row: Record<string, unknown>): Promise<{ bytes: Uint8Array; mimeType: string; fileName: string; sourceUrl: string }>; savePreview(values: Record<string, unknown>): Promise<Record<string, unknown>> };

function response(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }); }
function token(req: Request) { return req.headers.get('authorization')?.match(/^Bearer\s+([^\s]+)$/i)?.[1] ?? ''; }

export async function handlePreviewProgramRequest(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== 'POST') return response({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' } }, 405);
  try {
    const admin = await deps.authenticate(token(req));
    if (!admin?.id) return response({ error: { code: 'AUTH_REQUIRED', message: 'Sign in.' } }, 401);
    if (admin.role !== 'admin') return response({ error: { code: 'ADMIN_REQUIRED', message: 'Administrator access is required.' } }, 403);
    const body = await req.json();
    if (!body || Object.keys(body).some((key) => key !== 'submissionId') || !UUID.test(body.submissionId ?? '')) return response({ error: { code: 'INVALID_REQUEST', message: 'Invalid request.' } }, 400);
    const submission = await deps.loadSubmission(body.submissionId);
    if (!submission || submission.status !== 'approved') return response({ error: { code: 'NOT_READY', message: 'Submission is not approved.' } }, 409);
    const source = await deps.loadSource(submission);
    const preview = await parseProgram({
      ...source,
      submissionId: body.submissionId,
      conference: { slug: String(submission.conference_slug), name: String(submission.conference_name), year: Number(submission.conference_year) },
    });
    const saved = await deps.savePreview({
      target_submission_id: body.submissionId,
      target_actor_user_id: admin.id,
      target_source_sha256: preview.contentSha256,
      target_mode: preview.mode,
      target_records: preview.mode === 'structured' ? preview.allRecords : [],
    });
    return response({ data: saved });
  } catch {
    return response({ error: { code: 'PREVIEW_UNAVAILABLE', message: 'The preview could not be completed.' } }, 503);
  }
}

const DenoRuntime = (globalThis as { Deno?: { serve?: Function; env?: { get(name: string): string | undefined }; resolveDns?(host: string, type: 'A'|'AAAA'): Promise<string[]> } }).Deno;
if (DenoRuntime?.serve) DenoRuntime.serve(async (req: Request) => {
  const { createClient } = await import('npm:@supabase/supabase-js@2.112.3');
  const url = DenoRuntime.env?.get('SUPABASE_URL') ?? '';
  const publicKey = DenoRuntime.env?.get('SUPABASE_PUBLISHABLE_KEY') || DenoRuntime.env?.get('SUPABASE_ANON_KEY') || '';
  const secret = DenoRuntime.env?.get('SUPABASE_SECRET_KEY') || DenoRuntime.env?.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const service = createClient(url, secret, { auth: { persistSession: false } });
  const resolveHost = async (host: string) => [...await (DenoRuntime.resolveDns?.(host, 'A') ?? []), ...await (DenoRuntime.resolveDns?.(host, 'AAAA') ?? [])];
  return handlePreviewProgramRequest(req, {
    async authenticate(bearer) { const client = createClient(url, publicKey, { global: { headers: { Authorization: `Bearer ${bearer}` } } }); const { data, error } = await client.auth.getUser(bearer); return error || !data.user ? null : { id: data.user.id, role: data.user.app_metadata?.role === 'admin' ? 'admin' : '' }; },
    async loadSubmission(id) { const { data, error } = await service.from('program_submissions').select('*').eq('id', id).single(); if (error) throw error; return data; },
    async loadSource(row) {
      if (row.submission_kind === 'file') { const { data, error } = await service.storage.from('program-submissions').download(String(row.storage_path)); if (error) throw error; return { bytes: new Uint8Array(await data.arrayBuffer()), mimeType: String(row.mime_type), fileName: String(row.file_name), sourceUrl: String(row.official_conference_url) }; }
      let current = await validateRemoteUrl(String(row.program_url), resolveHost);
      for (let redirects = 0; redirects <= REMOTE_FETCH_LIMITS.maxRedirects; redirects += 1) {
        const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), REMOTE_FETCH_LIMITS.timeoutMs);
        const result = await fetch(current, { redirect: 'manual', signal: controller.signal }); clearTimeout(timeout);
        if (result.status >= 300 && result.status < 400) { const location = result.headers.get('location'); if (!location || redirects === REMOTE_FETCH_LIMITS.maxRedirects) throw new Error('redirect'); current = await validateRemoteUrl(new URL(location, current), resolveHost); continue; }
        if (!result.ok) throw new Error('fetch'); const bytes = new Uint8Array(await result.arrayBuffer()); if (bytes.byteLength > REMOTE_FETCH_LIMITS.maxResponseBytes) throw new Error('size');
        const type = result.headers.get('content-type')?.split(';')[0] ?? 'application/octet-stream'; const extension = type === 'text/csv' ? 'csv' : type === 'application/json' ? 'json' : type === 'application/pdf' ? 'pdf' : type === 'application/zip' ? 'zip' : ''; if (!extension) throw new Error('type');
        return { bytes, mimeType: type, fileName: `program.${extension}`, sourceUrl: current.href };
      }
      throw new Error('redirect');
    },
    async savePreview(values) { const { data, error } = await service.rpc('save_program_import_preview', values); if (error) throw error; return data; },
  });
});
