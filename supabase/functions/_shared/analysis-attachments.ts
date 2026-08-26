import { validAnonymousId } from './request-identity.ts';

export const MAX_ANALYSIS_ATTACHMENT_BYTES = 6 * 1024 * 1024;
const MAX_EXTRACTED_CHARACTERS = 120_000;
const MIN_EXTRACTED_CHARACTERS = 20;

type AttachmentKind = 'pdf' | 'markdown' | 'text';

type Principal = {
  ownerKey: string;
  maxAttachments: 1 | 3;
};

type PersistInput = {
  ownerKey: string;
  maxAttachments: 1 | 3;
  name: string;
  kind: AttachmentKind;
  extractedText: string;
};

export type AttachmentDependencies = {
  allowedOrigins: Set<string>;
  resolvePrincipal: (input: { req: Request; suppliedAnonymousId: string | null }) => Promise<Principal>;
  extractPdf: (bytes: Uint8Array) => Promise<string>;
  persist: (input: PersistInput) => Promise<{ attachmentId: string; expiresAt: string }>;
};

class AttachmentFailure extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function responseHeaders(origin: string | null, allowedOrigins: Set<string>) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    vary: 'Origin',
  });
  if (origin && allowedOrigins.has(origin)) headers.set('access-control-allow-origin', origin);
  return headers;
}

function json(data: unknown, status: number, origin: string | null, allowedOrigins: Set<string>) {
  return new Response(JSON.stringify(data), { status, headers: responseHeaders(origin, allowedOrigins) });
}

function safeName(value: string) {
  const name = value.normalize('NFKC').trim();
  if (!name || name.length > 255 || name.includes('/') || name.includes('\\') || name === '.' || name === '..') {
    throw new AttachmentFailure(400, 'INVALID_FILE', 'Use a simple filename.');
  }
  return name;
}

function kindFor(name: string, mime: string): AttachmentKind {
  const extension = name.split('.').at(-1)?.toLowerCase() ?? '';
  const normalizedMime = mime.toLowerCase();
  if (extension === 'pdf' && normalizedMime === 'application/pdf') return 'pdf';
  if ((extension === 'md' || extension === 'markdown') && ['', 'text/markdown', 'text/plain', 'text/x-markdown'].includes(normalizedMime)) return 'markdown';
  if (extension === 'txt' && ['', 'text/plain'].includes(normalizedMime)) return 'text';
  throw new AttachmentFailure(400, 'UNSUPPORTED_TYPE', 'Use PDF, Markdown, or TXT.');
}

function decodeText(bytes: Uint8Array): string {
  if (bytes.includes(0)) throw new AttachmentFailure(400, 'INVALID_FILE', 'The text file is not valid UTF-8.');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new AttachmentFailure(400, 'INVALID_FILE', 'The text file is not valid UTF-8.');
  }
}

function normalizedText(value: string): string {
  const text = value.replace(/\r\n?/gu, '\n').replace(/\u0000/gu, '').trim();
  if (text.length < MIN_EXTRACTED_CHARACTERS) {
    throw new AttachmentFailure(422, 'NO_READABLE_TEXT', 'No readable text was found. For a scanned PDF, upload an OCR-readable PDF, Markdown, or TXT file.');
  }
  return text.slice(0, MAX_EXTRACTED_CHARACTERS);
}

function isPdf(bytes: Uint8Array) {
  return bytes.length >= 5
    && bytes[0] === 0x25
    && bytes[1] === 0x50
    && bytes[2] === 0x44
    && bytes[3] === 0x46
    && bytes[4] === 0x2d;
}

export async function handleAnalysisAttachmentRequest(req: Request, dependencies: AttachmentDependencies): Promise<Response> {
  const origin = req.headers.get('origin');
  const { allowedOrigins } = dependencies;
  if (origin && !allowedOrigins.has(origin)) return json({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin not allowed.' } }, 403, null, allowedOrigins);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: responseHeaders(origin, allowedOrigins) });
  if (req.method !== 'POST') return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST for this endpoint.' } }, 405, origin, allowedOrigins);

  try {
    const declared = Number(req.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_ANALYSIS_ATTACHMENT_BYTES + 64 * 1024) {
      throw new AttachmentFailure(413, 'FILE_TOO_LARGE', 'Files must be 6 MB or smaller.');
    }
    const form = await req.formData();
    if ([...form.keys()].some((key) => key !== 'file' && key !== 'anonymousId')) {
      throw new AttachmentFailure(400, 'INVALID_REQUEST', 'Unexpected form field.');
    }
    const candidate = form.get('file');
    if (!candidate || typeof candidate === 'string' || typeof candidate.arrayBuffer !== 'function') {
      throw new AttachmentFailure(400, 'INVALID_FILE', 'Choose a file to upload.');
    }
    const name = safeName(candidate.name);
    if (!Number.isSafeInteger(candidate.size) || candidate.size < 1) throw new AttachmentFailure(400, 'INVALID_FILE', 'The file is empty.');
    if (candidate.size > MAX_ANALYSIS_ATTACHMENT_BYTES) throw new AttachmentFailure(413, 'FILE_TOO_LARGE', 'Files must be 6 MB or smaller.');
    const kind = kindFor(name, candidate.type);
    const suppliedAnonymousId = form.get('anonymousId');
    if (suppliedAnonymousId !== null && (typeof suppliedAnonymousId !== 'string' || !validAnonymousId(suppliedAnonymousId))) {
      throw new AttachmentFailure(400, 'INVALID_REQUEST', 'Invalid anonymous identity.');
    }
    const principal = await dependencies.resolvePrincipal({ req, suppliedAnonymousId });
    if (!/^(?:user:)?[0-9a-f-]{36,64}$/iu.test(principal.ownerKey)) throw new Error('invalid_owner_key');

    const bytes = new Uint8Array(await candidate.arrayBuffer());
    let extractedText: string;
    if (kind === 'pdf') {
      if (!isPdf(bytes)) throw new AttachmentFailure(400, 'INVALID_FILE', 'The file is not a valid PDF.');
      extractedText = await dependencies.extractPdf(bytes);
    } else {
      extractedText = decodeText(bytes);
    }
    extractedText = normalizedText(extractedText);

    const stored = await dependencies.persist({
      ownerKey: principal.ownerKey,
      maxAttachments: principal.maxAttachments,
      name,
      kind,
      extractedText,
    });
    return json({
      data: {
        attachmentId: stored.attachmentId,
        name,
        kind,
        characters: extractedText.length,
        expiresAt: stored.expiresAt,
      },
    }, 201, origin, allowedOrigins);
  } catch (error) {
    if (error instanceof AttachmentFailure) {
      return json({ error: { code: error.code, message: error.message } }, error.status, origin, allowedOrigins);
    }
    return json({ error: { code: 'ATTACHMENT_UNAVAILABLE', message: 'The file could not be processed. Try again.' } }, 503, origin, allowedOrigins);
  }
}
