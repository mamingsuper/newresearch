import { createHash } from 'node:crypto';
import { ValidationError, validatePaperRecord } from '../domain/schema.mjs';

function requiredText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError('is required', field);
  }
  return value.trim();
}

function optionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeAuthor(author) {
  if (typeof author === 'string') {
    return { name: requiredText(author, 'author.name'), affiliation: null };
  }
  if (author && typeof author === 'object' && !Array.isArray(author)) {
    return {
      name: requiredText(author.name, 'author.name'),
      affiliation: optionalText(author.affiliation),
    };
  }
  throw new ValidationError('must be a name string or author object', 'author');
}

function rawHash(record) {
  return createHash('sha256').update(JSON.stringify(record)).digest('hex');
}

function buildPaper({
  conference,
  sourceRecordId,
  title,
  abstract,
  authors,
  division,
  sessionTitle,
  sessionType,
  sourceUrl,
  keywords,
  retrievedAt,
  original,
}) {
  const idPart = requiredText(String(sourceRecordId ?? ''), 'sourceRecordId');
  return validatePaperRecord({
    id: `${conference.slug}-${conference.year}-${idPart}`,
    sourceRecordId: idPart,
    conference,
    title: requiredText(title, 'title').replace(/^\(Paper\)\s*/i, '').trim(),
    abstract: requiredText(abstract, 'abstract'),
    authors: Array.isArray(authors) ? authors.map(normalizeAuthor) : [],
    division: optionalText(division),
    sessionTitle: optionalText(sessionTitle),
    sessionType: optionalText(sessionType),
    sourceUrl: requiredText(sourceUrl, 'sourceUrl'),
    retrievedAt: retrievedAt ?? new Date().toISOString(),
    rawHash: rawHash(original),
    keywords: Array.isArray(keywords)
      ? keywords.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
      : [],
  });
}

export function normalizeApsaPaper(record, options = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new ValidationError('must be an object', 'APSA record');
  }
  return buildPaper({
    conference: { slug: 'apsa', name: 'APSA', year: 2026 },
    sourceRecordId: record.id,
    title: record.title,
    abstract: record.abstract,
    authors: record.authors,
    division: record.division,
    sessionTitle: record.sessionTitle,
    sessionType: record.sessionType,
    sourceUrl: record.directUrl,
    keywords: record.keywords,
    retrievedAt: options.retrievedAt,
    original: record,
  });
}

export function normalizeIcaPaper(record, options = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new ValidationError('must be an object', 'ICA record');
  }
  return buildPaper({
    conference: { slug: 'ica', name: 'ICA', year: 2026 },
    sourceRecordId: record.id,
    title: record.title,
    abstract: record.abstract,
    authors: record.authors,
    division: record.division,
    sessionTitle: record.session_title ?? record.sessionTitle,
    sessionType: record.session_type ?? record.sessionType,
    sourceUrl: record.url ?? record.directUrl ?? record.source_url,
    keywords: record.keywords,
    retrievedAt: options.retrievedAt,
    original: record,
  });
}
