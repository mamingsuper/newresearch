const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 100 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 2000;
const MAX_RECORDS = 20_000;

type Conference = { slug: string; name: string; year: number };
type ParseInput = { bytes: Uint8Array; mimeType: string; fileName: string; sourceUrl: string; submissionId: string; conference: Conference };

function invalid(message: string): never { throw new TypeError(message); }
function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/gu, ' ').slice(0, max) : '';
}
function safeUrl(value: unknown, fallback: string): string {
  try {
    const url = new URL(clean(value, 2048) || fallback);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : fallback;
  } catch { return fallback; }
}
function authorList(value: unknown) {
  const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split(';') : [];
  return items.slice(0, 100).map((entry) => typeof entry === 'string' ? clean(entry, 300) : clean((entry as Record<string, unknown>)?.name, 300)).filter(Boolean).map((name) => ({ name }));
}
function keywords(value: unknown) {
  const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[;,]/u) : [];
  return items.slice(0, 50).map((entry) => clean(entry, 100)).filter(Boolean);
}
async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n') { row.push(cell.replace(/\r$/u, '')); rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (quoted) invalid('CSV contains an unterminated quoted field.');
  if (cell || row.length) { row.push(cell.replace(/\r$/u, '')); rows.push(row); }
  const headers = (rows.shift() ?? []).map((value) => clean(value, 100).toLowerCase().replace(/[ _-]+/gu, '_'));
  for (const required of ['title', 'authors', 'abstract']) if (!headers.includes(required)) invalid(`CSV requires ${required}.`);
  return rows.filter((values) => values.some((value) => value.trim())).slice(0, MAX_RECORDS).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

async function unzipSingle(bytes: Uint8Array): Promise<{ name: string; bytes: Uint8Array }> {
  if (bytes.byteLength > MAX_SOURCE_BYTES) invalid('ZIP exceeds the compressed size limit.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries: Array<{ name: string; method: number; flags: number; compressed: number; expanded: number; offset: number }> = [];
  let offset = 0;
  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    if (entries.length >= MAX_ZIP_ENTRIES) invalid('ZIP has too many entries.');
    const flags = view.getUint16(offset + 6, true), method = view.getUint16(offset + 8, true);
    const compressed = view.getUint32(offset + 18, true), expanded = view.getUint32(offset + 22, true);
    const nameLength = view.getUint16(offset + 26, true), extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30, dataStart = nameStart + nameLength + extraLength;
    if ((flags & 1) || (flags & 8) || dataStart + compressed > bytes.length) invalid('ZIP encryption or streaming entries are not supported.');
    const name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.slice(nameStart, nameStart + nameLength));
    if (!name || name.startsWith('/') || name.includes('..') || name.includes('\\') || name.split('/').some((part) => part === '..')) invalid('ZIP path is unsafe.');
    entries.push({ name, method, flags, compressed, expanded, offset: dataStart });
    offset = dataStart + compressed;
  }
  const candidates = entries.filter((entry) => /\.(?:csv|json)$/iu.test(entry.name) && !entry.name.endsWith('/'));
  if (candidates.length !== 1) invalid('ZIP must contain exactly one CSV or JSON program file.');
  const entry = candidates[0];
  if (entry.expanded > MAX_EXPANDED_BYTES) invalid('ZIP expanded data is too large.');
  const compressed = bytes.slice(entry.offset, entry.offset + entry.compressed);
  if (entry.method === 0) return { name: entry.name, bytes: compressed };
  if (entry.method !== 8 || typeof DecompressionStream === 'undefined') invalid('ZIP compression method is not supported.');
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const expanded = new Uint8Array(await new Response(stream).arrayBuffer());
  if (expanded.byteLength > MAX_EXPANDED_BYTES || expanded.byteLength !== entry.expanded) invalid('ZIP expanded size is invalid.');
  return { name: entry.name, bytes: expanded };
}

async function normalizeRecord(row: Record<string, unknown>, index: number, input: ParseInput) {
  const title = clean(row.title, 1000), abstract = clean(row.abstract, 20_000), authors = authorList(row.authors);
  const errors: string[] = [];
  if (!title) errors.push('title_required');
  if (abstract.length < 20) errors.push('abstract_required');
  if (!authors.length) errors.push('authors_required');
  const sourceUrl = safeUrl(row.paper_url ?? row.source_url, input.sourceUrl);
  const sourceRecordId = `${input.submissionId}:${index + 1}`;
  const canonical = `${title}\n${authors.map((author) => author.name).join(';')}\n${abstract}`;
  return {
    record_index: index,
    validation_status: errors.length ? 'rejected' : 'valid',
    validation_errors: errors,
    source_record_id: sourceRecordId,
    title: title || null,
    abstract: abstract || null,
    authors: authors.length ? authors : null,
    division: clean(row.division, 300) || null,
    session_title: clean(row.session_title, 500) || null,
    session_type: clean(row.session_type, 100) || null,
    keywords: keywords(row.keywords),
    source_url: sourceUrl,
    raw_hash: await sha256(JSON.stringify(row)),
    embedding_input_hash: errors.length ? null : await sha256(canonical),
  };
}

export async function parseProgram(input: ParseInput) {
  if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength < 1 || input.bytes.byteLength > MAX_SOURCE_BYTES) invalid('Program source size is invalid.');
  const contentSha256 = await sha256(input.bytes);
  if (input.mimeType === 'application/pdf' || input.fileName.toLowerCase().endsWith('.pdf')) {
    if (!new TextDecoder().decode(input.bytes.slice(0, 5)).startsWith('%PDF-')) invalid('PDF signature is invalid.');
    return { mode: 'program_only' as const, records: [], rejections: [], contentSha256 };
  }
  let fileName = input.fileName, bytes = input.bytes;
  if (input.mimeType === 'application/zip' || fileName.toLowerCase().endsWith('.zip')) ({ name: fileName, bytes } = await unzipSingle(bytes));
  let rows: Array<Record<string, unknown>>;
  const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/u, '');
  if (fileName.toLowerCase().endsWith('.json') || input.mimeType === 'application/json') {
    const parsed = JSON.parse(decoded);
    if (!Array.isArray(parsed)) invalid('JSON program must be an array.');
    rows = parsed.slice(0, MAX_RECORDS);
  } else rows = parseCsv(decoded);
  const normalized = await Promise.all(rows.map((row, index) => normalizeRecord(row, index, input)));
  return {
    mode: 'structured' as const,
    records: normalized.filter((row) => row.validation_status === 'valid'),
    rejections: normalized.filter((row) => row.validation_status === 'rejected'),
    allRecords: normalized,
    contentSha256,
  };
}

export const PROGRAM_PARSE_LIMITS = Object.freeze({ MAX_SOURCE_BYTES, MAX_EXPANDED_BYTES, MAX_ZIP_ENTRIES, MAX_RECORDS });
