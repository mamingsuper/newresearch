import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { validatePaperRecord } from '../domain/schema.mjs';

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export async function readValidatedCorpus({ input, report }) {
  if (!input || !report) throw new TypeError('input and report are required');
  const [body, reportText] = await Promise.all([readFile(input, 'utf8'), readFile(report, 'utf8')]);
  const validation = JSON.parse(reportText);
  if (validation.schemaVersion !== 1) throw new Error('unsupported validation report schema');
  const actual = sha256(body);
  if (actual !== validation.outputSha256) throw new Error('validation report hash mismatch');
  const records = body.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return validatePaperRecord(JSON.parse(line)); }
    catch (error) { throw new Error(`invalid canonical NDJSON line ${index + 1}: ${error.message}`); }
  });
  if (records.length !== validation.validRecords) throw new Error('validation report record count mismatch');
  return { records, validation, inputSha256: actual };
}
