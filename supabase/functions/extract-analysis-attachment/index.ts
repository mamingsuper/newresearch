import { handleAnalysisAttachmentRequest } from '../_shared/analysis-attachments.ts';
import { anonymousOwnerKey } from '../_shared/request-identity.ts';

const ALLOWED_ORIGINS = new Set([
  'https://mamingsuper.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:8443',
  'http://127.0.0.1:8443',
]);

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

async function userId(req: Request): Promise<string | null> {
  const token = req.headers.get('authorization')?.match(/^Bearer\s+([^\s]+)$/iu)?.[1];
  if (!token) return null;
  const key = Deno.env.get('SUPABASE_PUBLISHABLE_KEY')?.trim() || Deno.env.get('SUPABASE_ANON_KEY')?.trim() || '';
  const response = await fetch(`${env('SUPABASE_URL').replace(/\/$/u, '')}/auth/v1/user`, {
    headers: { apikey: key, authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const data = await response.json();
  return typeof data?.id === 'string' ? data.id : null;
}

async function rpc(name: string, body: Record<string, unknown>): Promise<unknown> {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(`${env('SUPABASE_URL').replace(/\/$/u, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`rpc_${name}_${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

Deno.serve((req) => handleAnalysisAttachmentRequest(req, {
  allowedOrigins: ALLOWED_ORIGINS,
  async resolvePrincipal({ req: request, suppliedAnonymousId }) {
    const authenticated = await userId(request);
    if (authenticated) return { ownerKey: `user:${authenticated}`, maxAttachments: 3 };
    if (request.headers.has('authorization')) throw new Error('invalid_authorization');
    if (!suppliedAnonymousId) throw new Error('missing_anonymous_identity');
    return {
      ownerKey: await anonymousOwnerKey(request, suppliedAnonymousId, env('RATE_LIMIT_HMAC_KEY')),
      maxAttachments: 1,
    };
  },
  async extractPdf(bytes) {
    const { extractText, getDocumentProxy } = await import('npm:unpdf@1.6.0');
    const document = await getDocumentProxy(bytes);
    const result = await extractText(document, { mergePages: true });
    return result.text;
  },
  async persist(value) {
    const raw = await rpc('store_analysis_attachment', {
      target_owner_key: value.ownerKey,
      target_max_attachments: value.maxAttachments,
      target_file_name: value.name,
      target_kind: value.kind,
      target_extracted_text: value.extractedText,
    });
    const row = Array.isArray(raw) ? raw[0] : raw;
    if (!row || typeof row !== 'object') throw new Error('invalid_attachment_persistence');
    return { attachmentId: String(row.attachment_id ?? ''), expiresAt: String(row.expires_at ?? '') };
  },
}));
