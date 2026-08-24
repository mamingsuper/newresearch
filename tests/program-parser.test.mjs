import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProgram } from '../supabase/functions/_shared/program-parser.ts';

const base = { sourceUrl: 'https://official.example/program', submissionId: '11111111-1111-4111-8111-111111111111', conference: { slug: 'ica-2027', name: 'ICA', year: 2027 } };
test('CSV and JSON normalize canonical paper fields', async () => {
  const fixtures = [
    { fileName: 'program.csv', mimeType: 'text/csv', bytes: new TextEncoder().encode('title,authors,abstract\nPublic Trust and AI,Jane Doe;John Roe,This is a sufficiently long conference paper abstract.\n') },
    { fileName: 'program.json', mimeType: 'application/json', bytes: new TextEncoder().encode(JSON.stringify([{ title: 'Public Trust and AI', authors: ['Jane Doe'], abstract: 'This is a sufficiently long conference paper abstract.' }])) },
  ];
  for (const fixture of fixtures) { const preview = await parseProgram({ ...base, ...fixture }); assert.equal(preview.mode, 'structured'); assert.equal(preview.records[0].title, 'Public Trust and AI'); assert.equal(preview.records[0].source_url, base.sourceUrl); assert.match(preview.records[0].embedding_input_hash, /^[0-9a-f]{64}$/); }
});
test('PDF is program-only and malformed structured data fails closed', async () => {
  const pdf = await parseProgram({ ...base, fileName: 'program.pdf', mimeType: 'application/pdf', bytes: new TextEncoder().encode('%PDF-1.7') });
  assert.equal(pdf.mode, 'program_only'); assert.equal(pdf.records.length, 0);
  await assert.rejects(() => parseProgram({ ...base, fileName: 'program.json', mimeType: 'application/json', bytes: new TextEncoder().encode('{}') }), /array/i);
});
