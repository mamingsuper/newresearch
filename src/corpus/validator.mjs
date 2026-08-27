import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeApsaPaper, normalizeEpssPaper, normalizeIcaPaper } from '../ingestion/normalizers.mjs';

function recordsFromSnapshot(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && Array.isArray(value.papers)) return value.papers;
  throw new Error('Snapshot must be a JSON array or an object with a papers array.');
}

function adapterFor(source) {
  if (source === 'apsa') return normalizeApsaPaper;
  if (source === 'ica') return normalizeIcaPaper;
  if (source === 'epss') return normalizeEpssPaper;
  throw new Error(`Unsupported source adapter: ${source}`);
}

function rejectionReason(error) {
  const message = String(error?.message ?? 'invalid_record').toLowerCase();
  if (message.includes('abstract')) return 'missing_abstract';
  if (message.includes('sourceurl') || message.includes('url')) return 'invalid_source_url';
  if (message.includes('title')) return 'missing_title';
  if (message.includes('source record') || message.includes('sourcerecordid')) return 'missing_source_record_id';
  return 'invalid_record';
}

function hashText(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export async function validateSnapshot({ source, input, output, report, maxRejections = 0 }) {
  if (!source || !input || !output || !report) {
    throw new Error('source, input, output, and report are required');
  }
  const normalizedSource = String(source).toLowerCase();
  const normalize = adapterFor(normalizedSource);
  const raw = await readFile(input, 'utf8');
  if (Buffer.byteLength(raw) > 100 * 1024 * 1024) throw new Error('input_too_large');
  const records = recordsFromSnapshot(JSON.parse(raw));
  const retrievedAt = new Date().toISOString();
  const valid = [];
  const rejections = [];
  for (const [index, record] of records.entries()) {
    try {
      valid.push(normalize(record, { retrievedAt }));
    } catch (error) {
      rejections.push({
        sourceRecordId: record && typeof record === 'object' ? String(record.id ?? '') || null : null,
        reasonCode: rejectionReason(error),
        safeDetail: `record[${index}]`,
      });
    }
  }
  if (valid.length > 0) {
    const slug = valid[0].conference.slug;
    const year = valid[0].conference.year;
    if (valid.some((paper) => paper.conference.slug !== slug || paper.conference.year !== year)) {
      throw new Error('validated NDJSON must contain exactly one conference and year');
    }
  }
  await mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await mkdir(path.dirname(path.resolve(report)), { recursive: true });
  const body = valid.map((paper) => JSON.stringify(paper)).join('\n');
  const ndjson = body ? `${body}\n` : '';
  await writeFile(output, ndjson, 'utf8');
  const rejectionCounts = {};
  for (const item of rejections) rejectionCounts[item.reasonCode] = (rejectionCounts[item.reasonCode] ?? 0) + 1;
  const first = valid[0] ?? null;
  const reportValue = {
    schemaVersion: 1,
    sourceAdapter: normalizedSource,
    conferenceSlug: first?.conference.slug ?? null,
    conferenceName: first?.conference.name ?? null,
    conferenceYear: first?.conference.year ?? null,
    inputPath: input,
    outputPath: output,
    totalRecords: records.length,
    validRecords: valid.length,
    rejectedRecords: rejections.length,
    rejectionsByReason: rejectionCounts,
    rejections,
    outputSha256: hashText(ndjson),
  };
  await writeFile(report, `${JSON.stringify(reportValue, null, 2)}\n`, 'utf8');
  if (rejections.length > Number(maxRejections)) {
    const error = new Error(`rejection threshold exceeded: ${rejections.length} > ${maxRejections}`);
    error.code = 'REJECTION_THRESHOLD_EXCEEDED';
    throw error;
  }
  return reportValue;
}
