#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const GRAPHQL_URL = 'https://graphql.oxfordabstracts.com/v1/graphql';
const APP_URL = 'https://app.oxfordabstracts.com/api/virtual/events';
const PUBLIC_ORIGIN = 'https://virtual.oxfordabstracts.com';

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const name = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${name}`);
    args[name] = value;
    index += 1;
  }
  return args;
}

function decodeEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

export function plainText(value) {
  if (typeof value !== 'string') return '';
  return decodeEntities(value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function visibleValue(response) {
  return plainText(response?.without_html || response?.value || '');
}

function authorName(author) {
  return [author?.first_name, author?.middle_initial, author?.last_name]
    .map((part) => plainText(part))
    .filter(Boolean)
    .join(' ');
}

function authorAffiliation(author) {
  const values = (author?.affiliations ?? []).map((item) =>
    [item?.institution, item?.city, item?.state, item?.country]
      .map((part) => plainText(part))
      .filter(Boolean)
      .join(', '));
  return [...new Set(values.filter(Boolean))].join('; ') || null;
}

function questionName(response) {
  return plainText(response?.question?.question_name || '');
}

function firstSession(submission) {
  const direct = submission?.program_sessions_submissions?.[0]?.program_session;
  if (direct) return direct;
  return submission?.symposium?.program_sessions_symposia?.[0]?.program_session ?? null;
}

export function toSnapshotRecord(submission, titleBySerial, eventId) {
  const serial = String(submission?.serial_number ?? '').trim();
  const responses = Array.isArray(submission?.responses) ? submission.responses : [];
  const titleResponse = responses.find((item) => item?.question?.is_title);
  const title = plainText(titleBySerial.get(serial) || visibleValue(titleResponse));
  const abstractCandidates = responses
    .filter((item) => /abstract/i.test(questionName(item)))
    .map(visibleValue)
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
  const categories = [...new Set(responses
    .filter((item) => item?.question?.is_category)
    .map(visibleValue)
    .filter(Boolean))];
  const session = firstSession(submission);
  return {
    id: serial,
    title,
    abstract: abstractCandidates[0] ?? '',
    authors: (submission?.authors ?? []).map((author) => ({
      name: authorName(author),
      affiliation: authorAffiliation(author),
    })).filter((author) => author.name),
    division: categories[0] ?? null,
    sessionTitle: plainText(session?.name || '') || null,
    sessionType: plainText(session?.program_type?.name || '') || null,
    directUrl: `${PUBLIC_ORIGIN}/event/${eventId}/submission/${serial}`,
    keywords: categories,
  };
}

async function fetchJson(url, options, label) {
  let lastStatus = 0;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30_000) });
    lastStatus = response.status;
    if (response.ok) return response.json();
    if (![429, 502, 503, 504].includes(response.status) || attempt === 4) break;
    await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** (attempt - 1))));
  }
  throw new Error(`${label} failed with HTTP ${lastStatus}`);
}

async function publicToken(eventId) {
  const result = await fetchJson(`${APP_URL}/${eventId}/hasura-authenticate-event-tokens`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: PUBLIC_ORIGIN },
    body: '{}',
  }, 'public event authentication');
  if (typeof result?.publicEvent?.token !== 'string') {
    throw new Error('event is not available through the public program');
  }
  return result.publicEvent.token;
}

async function queryGraphql(token, operationName, query, variables = {}) {
  const result = await fetchJson(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-oa-op-type': 'query',
    },
    body: JSON.stringify({ operationName, query, variables }),
  }, operationName);
  if (Array.isArray(result?.errors) && result.errors.length > 0) {
    throw new Error(`${operationName} returned GraphQL errors`);
  }
  return result?.data;
}

const TITLES_QUERY = `query titles_batch($offset: Int!, $limit: Int!) {
  ordered_titles_with_speakers_aggregate(where: {_and: []}) { aggregate { count } }
  ordered_titles_with_speakers(
    offset: $offset
    limit: $limit
    order_by: {title_no_tags: asc}
    where: {_and: []}
  ) {
    title_no_tags
    accepted_submission
    submission { serial_number event_id }
  }
}`;

const SUBMISSIONS_QUERY = `query submissions_batch($serials: [Int!]!) {
  submissions(where: {serial_number: {_in: $serials}}, order_by: {serial_number: asc}) {
    serial_number
    event_id
    authors(order_by: {author_order: asc}) {
      first_name
      middle_initial
      last_name
      affiliations: affiliations_without_hidden_responses(order_by: {affiliation_order: asc}) {
        institution
        city
        state
        country
      }
    }
    responses {
      value
      without_html
      question { is_title is_category question_name }
    }
    program_sessions_submissions {
      program_session { name program_type { name } }
    }
    symposium {
      program_sessions_symposia {
        program_session { name program_type { name } }
      }
    }
  }
}`;

export async function fetchOxfordSnapshot({ eventId, output, batchSize = 50, maxRecords }) {
  if (!Number.isInteger(eventId) || eventId <= 0) throw new Error('eventId must be a positive integer');
  if (!output) throw new Error('output is required');
  const token = await publicToken(eventId);
  const titles = [];
  let expected = null;
  const titlePageSize = 200;
  for (let offset = 0; expected === null || offset < expected; offset += titlePageSize) {
    const data = await queryGraphql(token, 'titles_batch', TITLES_QUERY, { offset, limit: titlePageSize });
    expected = data?.ordered_titles_with_speakers_aggregate?.aggregate?.count ?? 0;
    titles.push(...(data?.ordered_titles_with_speakers ?? []));
    if (maxRecords && titles.length >= maxRecords) break;
  }
  const titleBySerial = new Map();
  for (const row of titles) {
    const submission = row?.submission;
    if (!row?.accepted_submission || Number(submission?.event_id) !== eventId) continue;
    const serial = String(submission?.serial_number ?? '').trim();
    if (serial) titleBySerial.set(serial, plainText(row?.title_no_tags || ''));
  }
  const serials = [...titleBySerial.keys()]
    .slice(0, maxRecords || Number.POSITIVE_INFINITY)
    .map(Number)
    .filter(Number.isInteger);
  const records = [];
  for (let offset = 0; offset < serials.length; offset += batchSize) {
    const batch = serials.slice(offset, offset + batchSize);
    const data = await queryGraphql(token, 'submissions_batch', SUBMISSIONS_QUERY, { serials: batch });
    for (const submission of data?.submissions ?? []) {
      if (Number(submission?.event_id) !== eventId) continue;
      records.push(toSnapshotRecord(submission, titleBySerial, eventId));
    }
    console.log(JSON.stringify({ command: 'corpus:fetch:oxford:batch', fetched: records.length, expected: serials.length }));
    if (offset + batchSize < serials.length) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await writeFile(output, `${JSON.stringify({ eventId, totalTitles: expected, papers: records })}\n`, 'utf8');
  return {
    eventId,
    totalTitles: expected,
    candidateSubmissions: serials.length,
    records: records.length,
    missingAbstracts: records.filter((record) => record.abstract.length < 10).length,
    output,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await fetchOxfordSnapshot({
    eventId: Number.parseInt(args['event-id'], 10),
    output: args.output,
    batchSize: args['batch-size'] ? Number.parseInt(args['batch-size'], 10) : 50,
    maxRecords: args['max-records'] ? Number.parseInt(args['max-records'], 10) : undefined,
  });
  console.log(JSON.stringify({ command: 'corpus:fetch:oxford', ...result }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(JSON.stringify({ command: 'corpus:fetch:oxford', errorCode: error?.code ?? 'FETCH_FAILED', message: error?.message ?? 'unknown error' }));
    process.exitCode = 2;
  });
}
