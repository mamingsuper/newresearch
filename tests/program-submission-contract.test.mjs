import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REMOTE_FETCH_LIMITS,
  canTransition,
  validateFileDescriptor,
  validateRemoteUrl,
  validateSubmission,
} from '../supabase/functions/_shared/program-submission.ts';

const encoder = new TextEncoder();
const resolver = (...addresses) => async () => addresses;

function pdfBytes() {
  return encoder.encode('%PDF-1.7\n');
}

function zipBytes() {
  return new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
}

function submission(overrides = {}) {
  return {
    conferenceName: ' International Communication Association ',
    acronym: 'ICA',
    year: 2026,
    discipline: 'Communication',
    officialConferenceUrl: 'https://www.icahdq.org/conference',
    notes: ' Reviewed program source. ',
    rightsAttested: true,
    kind: 'url',
    programUrl: 'https://program.icahdq.org/2026',
    ...overrides,
  };
}

test('remote URL validation rejects protocol, credentials, fragments, and local hostnames', async () => {
  await assert.rejects(
    () => validateRemoteUrl('http://conference.example/program', resolver('93.184.216.34')),
    /https/i,
  );
  await assert.rejects(
    () => validateRemoteUrl('https://user:pass@example.org/program', resolver('93.184.216.34')),
    /credentials/i,
  );
  await assert.rejects(
    () => validateRemoteUrl('https://conference.example/program#payload', resolver('93.184.216.34')),
    /fragment/i,
  );
  for (const host of ['localhost', 'api.localhost', 'printer.local', 'router.home.arpa']) {
    await assert.rejects(() => validateRemoteUrl(`https://${host}/program`, resolver('93.184.216.34')), /local/i);
  }
});

test('remote URL validation rejects every private, local, documentation, and reserved address family', async () => {
  const disallowed = [
    '0.0.0.0',
    '10.0.0.2',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.0.2.1',
    '192.168.1.1',
    '198.18.0.1',
    '198.51.100.9',
    '203.0.113.8',
    '224.0.0.1',
    '240.0.0.1',
    '::',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fe80::1',
    'fec0::1',
    'ff02::1',
    '2001:db8::1',
    '2001::1',
    '2001:100::1',
    '2002:7f00:1::1',
    '3fff::1',
    '4000::1',
  ];

  for (const address of disallowed) {
    await assert.rejects(
      () => validateRemoteUrl('https://conference.example/program', resolver(address)),
      /private|local|reserved/i,
      address,
    );
  }
});

test('DNS validation fails closed and checks all answers and each redirect destination', async () => {
  await assert.rejects(
    () => validateRemoteUrl('https://conference.example/program', resolver()),
    /resolve/i,
  );
  await assert.rejects(
    () => validateRemoteUrl('https://conference.example/program', async () => { throw new Error('dns unavailable'); }),
    /resolve/i,
  );
  await assert.rejects(
    () => validateRemoteUrl('https://conference.example/program', resolver('93.184.216.34', '10.0.0.1')),
    /private|reserved/i,
  );
  await assert.rejects(
    () => validateRemoteUrl('https://conference.example/program', resolver({ address: 'not-an-ip' })),
    /resolve/i,
  );

  const first = await validateRemoteUrl(
    'https://conference.example/program',
    resolver({ address: '93.184.216.34' }, '2001:4860:4860::8888', '2606:4700:4700::1111'),
  );
  assert.equal(first.href, 'https://conference.example/program');

  await assert.rejects(
    () => validateRemoteUrl(new URL('/redirected', 'https://127.0.0.1/program').href, resolver('127.0.0.1')),
    /private|local|reserved/i,
  );
});

test('remote fetch limits are bounded for callers that follow redirects', () => {
  assert.deepEqual(REMOTE_FETCH_LIMITS, {
    maxRedirects: 3,
    maxResponseBytes: 25 * 1024 * 1024,
    timeoutMs: 20_000,
  });
});

test('file validation requires extension, MIME, magic bytes, safe name, and size to agree', () => {
  assert.throws(
    () => validateFileDescriptor({ name: 'program.pdf', size: 30 * 1024 * 1024, declaredMime: 'application/pdf', magicBytes: pdfBytes() }),
    /25 MiB/i,
  );
  assert.throws(
    () => validateFileDescriptor({ name: 'program.pdf', size: 100, declaredMime: 'application/pdf', magicBytes: zipBytes() }),
    /signature/i,
  );
  assert.throws(
    () => validateFileDescriptor({ name: 'program.pdf', size: 100, declaredMime: 'application/zip', magicBytes: pdfBytes() }),
    /MIME/i,
  );
  assert.throws(
    () => validateFileDescriptor({ name: '../program.csv', size: 100, declaredMime: 'text/csv', magicBytes: encoder.encode('title,abstract\na,b') }),
    /file name/i,
  );
  assert.throws(
    () => validateFileDescriptor({ name: '论文.pdf', size: 100, declaredMime: 'application/pdf', magicBytes: pdfBytes() }),
    /file name/i,
  );
  assert.throws(
    () => validateFileDescriptor({ name: 'program.pdf', size: 1, declaredMime: 'application/pdf', magicBytes: pdfBytes() }),
    /size/i,
  );
  assert.throws(
    () => validateFileDescriptor({ name: 'program.csv', size: 100, declaredMime: 'text/csv', magicBytes: new Uint8Array([0xff, 0xfe, 0x00]) }),
    /signature/i,
  );

  assert.equal(validateFileDescriptor({ name: 'PROGRAM.PDF', size: pdfBytes().length, declaredMime: 'application/pdf', magicBytes: pdfBytes() }).extension, 'pdf');
  assert.equal(validateFileDescriptor({ name: 'program.zip', size: zipBytes().length, declaredMime: 'application/zip', magicBytes: zipBytes() }).extension, 'zip');
  assert.equal(validateFileDescriptor({ name: 'program.json', size: 100, declaredMime: 'application/json', magicBytes: encoder.encode(' \n {"papers":[]}') }).extension, 'json');
  assert.equal(validateFileDescriptor({ name: 'program.csv', size: 100, declaredMime: 'text/csv', magicBytes: encoder.encode('title,abstract\na,b') }).extension, 'csv');
});

test('submission validation normalizes required metadata and enforces exactly one source', () => {
  const result = validateSubmission(submission());
  assert.equal(result.conferenceName, 'International Communication Association');
  assert.equal(result.notes, 'Reviewed program source.');
  assert.equal(result.kind, 'url');
  assert.equal(result.programUrl, 'https://program.icahdq.org/2026');

  for (const invalid of [
    submission({ conferenceName: '' }),
    submission({ acronym: '' }),
    submission({ year: 1899 }),
    submission({ year: 2101 }),
    submission({ discipline: '' }),
    submission({ officialConferenceUrl: 'http://conference.example' }),
    submission({ rightsAttested: false }),
    submission({ storagePath: 'user/id/program.pdf' }),
    submission({ kind: 'file', programUrl: undefined }),
  ]) {
    assert.throws(() => validateSubmission(invalid), /invalid|require|source|https|rights/i);
  }

  const fileResult = validateSubmission(submission({
    kind: 'file',
    programUrl: undefined,
    storagePath: '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/program.pdf',
    fileName: 'program.pdf',
    fileSizeBytes: 1234,
    mimeType: 'application/pdf',
    sha256: 'a'.repeat(64),
  }));
  assert.equal(fileResult.kind, 'file');
  assert.equal(fileResult.sha256, 'a'.repeat(64));
});

test('submission lifecycle is closed and terminal states cannot transition', () => {
  const allowed = [
    ['submitted', 'under_review'],
    ['submitted', 'rejected'],
    ['under_review', 'approved'],
    ['under_review', 'rejected'],
    ['approved', 'import_preview'],
    ['approved', 'rejected'],
    ['import_preview', 'imported'],
    ['import_preview', 'rejected'],
  ];
  for (const [from, to] of allowed) assert.equal(canTransition(from, to), true, `${from} -> ${to}`);
  for (const transition of [
    ['submitted', 'imported'],
    ['approved', 'imported'],
    ['imported', 'submitted'],
    ['rejected', 'under_review'],
    ['unknown', 'submitted'],
    ['submitted', 'unknown'],
  ]) assert.equal(canTransition(...transition), false, transition.join(' -> '));
});
