const MAX_URL_LENGTH = 2048;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

const FILE_TYPES = {
  pdf: 'application/pdf',
  csv: 'text/csv',
  json: 'application/json',
  zip: 'application/zip',
} as const;

type FileExtension = keyof typeof FILE_TYPES;
type SubmissionStatus = 'submitted' | 'under_review' | 'approved' | 'import_preview' | 'imported' | 'rejected';
type ResolvedAddress = string | { address?: unknown };
type HostResolver = (hostname: string) => Promise<ResolvedAddress[]>;

type SubmissionBase = {
  conferenceName: string;
  acronym: string;
  year: number;
  discipline: string;
  officialConferenceUrl: string;
  notes: string;
  rightsAttested: true;
};

export type ProgramSubmissionInput = SubmissionBase & (
  | { kind: 'url'; programUrl: string }
  | {
      kind: 'file';
      storagePath: string;
      fileName: string;
      fileSizeBytes: number;
      mimeType: (typeof FILE_TYPES)[FileExtension];
      sha256: string;
    }
);

export const REMOTE_FETCH_LIMITS = Object.freeze({
  maxRedirects: 3,
  maxResponseBytes: MAX_FILE_BYTES,
  timeoutMs: 20_000,
});

function invalid(message: string): never {
  throw new TypeError(message);
}

function boundedText(value: unknown, field: string, min: number, max: number, collapse = true): string {
  if (typeof value !== 'string') invalid(`${field} is invalid.`);
  const normalized = value.normalize('NFKC').trim();
  const clean = collapse ? normalized.replace(/\s+/gu, ' ') : normalized;
  if (clean.length < min || clean.length > max) invalid(`${field} is invalid.`);
  return clean;
}

function validateHttpsUrl(value: unknown, field: string): URL {
  const raw = boundedText(value, field, 1, MAX_URL_LENGTH, false);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return invalid(`${field} must be a valid HTTPS URL.`);
  }
  if (parsed.protocol !== 'https:') invalid(`${field} must use HTTPS.`);
  if (parsed.username || parsed.password) invalid(`${field} must not contain credentials.`);
  if (parsed.hash) invalid(`${field} must not contain a fragment.`);
  if (!parsed.hostname || parsed.href.length > MAX_URL_LENGTH) invalid(`${field} is invalid.`);
  return parsed;
}

function parseIpv4(input: string): number[] | null {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(input)) return null;
  const parts = input.split('.').map(Number);
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parts;
}

function parseIpv6(input: string): Uint8Array | null {
  let address = input.toLowerCase();
  if (address.startsWith('[') && address.endsWith(']')) address = address.slice(1, -1);
  if (!address || address.includes('%') || !/^[0-9a-f:.]+$/.test(address)) return null;

  const ipv4Separator = address.lastIndexOf(':');
  const ipv4Text = ipv4Separator >= 0 ? address.slice(ipv4Separator + 1) : '';
  if (ipv4Text.includes('.')) {
    const ipv4 = parseIpv4(ipv4Text);
    if (!ipv4) return null;
    const high = ((ipv4[0] << 8) | ipv4[1]).toString(16);
    const low = ((ipv4[2] << 8) | ipv4[3]).toString(16);
    address = `${address.slice(0, ipv4Separator + 1)}${high}:${low}`;
  }

  if ((address.match(/::/g) ?? []).length > 1) return null;
  const hasCompression = address.includes('::');
  const [leftText, rightText = ''] = address.split('::');
  const left = leftText ? leftText.split(':') : [];
  const right = rightText ? rightText.split(':') : [];
  if ([...left, ...right].some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  if ((!hasCompression && left.length !== 8) || (hasCompression && left.length + right.length >= 8)) return null;

  const groups = hasCompression
    ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right]
    : left;
  if (groups.length !== 8) return null;
  const bytes = new Uint8Array(16);
  groups.forEach((group, index) => {
    const value = Number.parseInt(group, 16);
    bytes[index * 2] = value >> 8;
    bytes[index * 2 + 1] = value & 0xff;
  });
  return bytes;
}

function isDisallowedIpv4(parts: number[]): boolean {
  const [a, b] = parts;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0)
    || (a === 192 && b === 88 && parts[2] === 99)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19 || b === 51 && parts[2] === 100))
    || (a === 203 && b === 0 && parts[2] === 113)
    || a >= 224;
}

function prefix(bytes: Uint8Array, expected: number[]): boolean {
  return expected.every((value, index) => bytes[index] === value);
}

function lastIpv4(bytes: Uint8Array): number[] {
  return Array.from(bytes.slice(12, 16));
}

function isDisallowedIpv6(bytes: Uint8Array): boolean {
  const allZero = bytes.every((byte) => byte === 0);
  const loopback = bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1;
  if (allZero || loopback) return true;
  if ((bytes[0] & 0xfe) === 0xfc) return true; // unique-local fc00::/7
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return true; // link-local fe80::/10
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0xc0) return true; // deprecated site-local fec0::/10
  if (bytes[0] === 0xff) return true; // multicast
  if ((bytes[0] & 0xe0) !== 0x20) return true; // outside allocated global-unicast 2000::/3
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] <= 0x01) return true; // IETF special-purpose 2001::/23
  if (prefix(bytes, [0x20, 0x01, 0x0d, 0xb8])) return true; // documentation
  if (bytes[0] === 0x3f && bytes[1] === 0xff && (bytes[2] & 0xf0) === 0) return true; // documentation 3fff::/20

  const compatible = bytes.slice(0, 12).every((byte) => byte === 0);
  const mapped = bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  if (compatible || mapped) return isDisallowedIpv4(lastIpv4(bytes));
  if (prefix(bytes, [0x20, 0x02])) return isDisallowedIpv4(Array.from(bytes.slice(2, 6))); // 6to4
  return false;
}

function classifyAddress(raw: string): 'public' | 'disallowed' | 'invalid' {
  const address = raw.startsWith('[') && raw.endsWith(']') ? raw.slice(1, -1) : raw;
  const ipv4 = parseIpv4(address);
  if (ipv4) return isDisallowedIpv4(ipv4) ? 'disallowed' : 'public';
  const ipv6 = parseIpv6(address);
  if (ipv6) return isDisallowedIpv6(ipv6) ? 'disallowed' : 'public';
  return 'invalid';
}

function localHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return host === 'localhost'
    || host.endsWith('.localhost')
    || host.endsWith('.local')
    || host === 'home.arpa'
    || host.endsWith('.home.arpa');
}

/** Validate this URL hop before a fetch. Call again for every redirect target. */
export async function validateRemoteUrl(value: string | URL, resolveHost: HostResolver): Promise<URL> {
  if (typeof resolveHost !== 'function') invalid('A DNS resolver is required.');
  const parsed = validateHttpsUrl(value instanceof URL ? value.href : value, 'Remote URL');
  if (localHostname(parsed.hostname)) invalid('Remote URL must not use a local hostname.');

  const literalKind = classifyAddress(parsed.hostname);
  let answers: ResolvedAddress[];
  if (literalKind !== 'invalid') {
    answers = [parsed.hostname];
  } else {
    try {
      answers = await resolveHost(parsed.hostname);
    } catch {
      return invalid('Remote host could not be resolved safely.');
    }
  }
  if (!Array.isArray(answers) || answers.length < 1 || answers.length > 64) {
    invalid('Remote host must resolve to a bounded address set.');
  }

  for (const answer of answers) {
    const address = typeof answer === 'string' ? answer : answer && typeof answer.address === 'string' ? answer.address : '';
    const classification = classifyAddress(address);
    if (classification === 'invalid') invalid('Remote host returned an invalid resolved address.');
    if (classification === 'disallowed') invalid('Remote host resolves to a private, local, or reserved address.');
  }
  return parsed;
}

function fileExtension(name: string): FileExtension {
  const match = name.match(/\.([A-Za-z0-9]+)$/);
  const extension = match?.[1]?.toLowerCase() as FileExtension | undefined;
  if (!extension || !Object.hasOwn(FILE_TYPES, extension)) invalid('File extension is not supported.');
  return extension;
}

function safeFileName(value: unknown): string {
  const name = boundedText(value, 'File name', 1, 255, false);
  if (!/^[A-Za-z0-9][A-Za-z0-9._ -]{0,254}$/u.test(name) || name === '.' || name === '..') {
    invalid('File name is invalid.');
  }
  return name;
}

function fileMetadata(input: { name: unknown; size: unknown; declaredMime: unknown }) {
  const name = safeFileName(input.name);
  const extension = fileExtension(name);
  if (!Number.isSafeInteger(input.size) || Number(input.size) < 1) invalid('File size is invalid.');
  if (Number(input.size) > MAX_FILE_BYTES) invalid('File must not exceed 25 MiB.');
  if (input.declaredMime !== FILE_TYPES[extension]) invalid('File extension and MIME type do not agree.');
  return { name, extension, size: Number(input.size), declaredMime: FILE_TYPES[extension] };
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);
}

function validUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function validateFileDescriptor(input: {
  name: unknown;
  size: unknown;
  declaredMime: unknown;
  magicBytes: unknown;
}) {
  const metadata = fileMetadata(input);
  if (!(input.magicBytes instanceof Uint8Array) || input.magicBytes.length < 1) invalid('File signature is missing.');
  const bytes = input.magicBytes;
  if (bytes.length > metadata.size) invalid('File signature sample exceeds the declared file size.');
  let signatureMatches = false;

  if (metadata.extension === 'pdf') {
    signatureMatches = startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  } else if (metadata.extension === 'zip') {
    signatureMatches = [
      [0x50, 0x4b, 0x03, 0x04],
      [0x50, 0x4b, 0x05, 0x06],
      [0x50, 0x4b, 0x07, 0x08],
    ].some((signature) => startsWith(bytes, signature));
  } else {
    const text = validUtf8(bytes);
    if (text !== null && !text.includes('\u0000')) {
      const clean = text.replace(/^\uFEFF/u, '').trimStart();
      signatureMatches = metadata.extension === 'json'
        ? clean.startsWith('{') || clean.startsWith('[')
        : !clean.startsWith('{')
          && !clean.startsWith('[')
          && !clean.startsWith('%PDF-')
          && /[,;\t]/u.test(clean)
          && /[\r\n]/u.test(clean);
    }
  }
  if (!signatureMatches) invalid('File signature does not match its extension and MIME type.');
  return metadata;
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

export function validateSubmission(value: unknown): ProgramSubmissionInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Submission is invalid.');
  const input = value as Record<string, unknown>;
  const conferenceName = boundedText(input.conferenceName, 'Conference name', 1, 200);
  const acronym = boundedText(input.acronym, 'Acronym', 1, 32);
  if (!Number.isInteger(input.year) || Number(input.year) < 1900 || Number(input.year) > 2100) {
    invalid('Conference year is invalid.');
  }
  const year = Number(input.year);
  const discipline = boundedText(input.discipline, 'Discipline', 1, 100);
  const officialConferenceUrl = validateHttpsUrl(input.officialConferenceUrl, 'Official conference URL').href;
  const notes = input.notes === undefined || input.notes === null || input.notes === ''
    ? ''
    : boundedText(input.notes, 'Notes', 1, 4000, false);
  if (input.rightsAttested !== true) invalid('Rights attestation is required.');

  const base: SubmissionBase = {
    conferenceName,
    acronym,
    year,
    discipline,
    officialConferenceUrl,
    notes,
    rightsAttested: true,
  };

  if (input.kind === 'url') {
    if ([input.storagePath, input.fileName, input.fileSizeBytes, input.mimeType, input.sha256].some(hasValue)) {
      invalid('Exactly one submission source is required.');
    }
    return {
      ...base,
      kind: 'url',
      programUrl: validateHttpsUrl(input.programUrl, 'Program URL').href,
    };
  }

  if (input.kind === 'file') {
    if (hasValue(input.programUrl)) invalid('Exactly one submission source is required.');
    const metadata = fileMetadata({
      name: input.fileName,
      size: input.fileSizeBytes,
      declaredMime: input.mimeType,
    });
    const storagePath = boundedText(input.storagePath, 'Storage path', 1, 512, false);
    const parts = storagePath.split('/');
    if (parts.length !== 3 || !UUID_PATTERN.test(parts[0]) || !UUID_PATTERN.test(parts[1]) || parts[2] !== metadata.name) {
      invalid('Storage path is invalid.');
    }
    if (typeof input.sha256 !== 'string' || !SHA256_PATTERN.test(input.sha256)) invalid('SHA-256 is invalid.');
    return {
      ...base,
      kind: 'file',
      storagePath,
      fileName: metadata.name,
      fileSizeBytes: metadata.size,
      mimeType: metadata.declaredMime,
      sha256: input.sha256,
    };
  }

  return invalid('Submission kind is invalid; exactly one source is required.');
}

const transitions: Record<SubmissionStatus, ReadonlySet<SubmissionStatus>> = {
  submitted: new Set(['under_review', 'rejected']),
  under_review: new Set(['approved', 'rejected']),
  approved: new Set(['import_preview', 'rejected']),
  import_preview: new Set(['imported', 'rejected']),
  imported: new Set(),
  rejected: new Set(),
};

export function canTransition(from: unknown, to: unknown): boolean {
  if (typeof from !== 'string' || typeof to !== 'string' || !Object.hasOwn(transitions, from)) return false;
  return transitions[from as SubmissionStatus].has(to as SubmissionStatus);
}
