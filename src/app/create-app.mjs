import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { analyzeIdea } from '../pipeline/analyze-idea.mjs';
import { ValidationError } from '../domain/schema.mjs';

const MAX_BODY_BYTES = 32 * 1024;

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
]);

async function serveStatic(request, response, publicDir, pathname) {
  if (!['GET', 'HEAD'].includes(request.method ?? 'GET')) return false;
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return false; }
  if (decoded.includes('\0')) return false;
  const requestedPath = decoded === '/' ? '/index.html' : decoded;
  const root = path.resolve(publicDir);
  const absolutePath = path.resolve(root, `.${requestedPath}`);
  const relative = path.relative(root, absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return false;
  let body;
  try { body = await readFile(absolutePath); }
  catch (error) { if (error?.code === 'ENOENT' || error?.code === 'EISDIR') return false; throw error; }
  const contentType = MIME_TYPES.get(path.extname(absolutePath).toLowerCase()) ?? 'application/octet-stream';
  response.writeHead(200, {
    'content-type': contentType,
    'content-length': body.length,
    'cache-control': requestedPath === '/index.html' ? 'no-cache' : 'public, max-age=300',
    'content-security-policy': "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  });
  if (request.method === 'HEAD') response.end(); else response.end(body);
  return true;
}

function writeJson(response, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store', ...extraHeaders });
  response.end(body);
}

async function readJsonBody(request) {
  let size = 0; const chunks = [];
  for await (const chunk of request) { size += chunk.length; if (size > MAX_BODY_BYTES) { const error = new ValidationError('request body is too large', 'request'); error.code = 'BODY_TOO_LARGE'; throw error; } chunks.push(chunk); }
  if (chunks.length === 0) throw new ValidationError('JSON body is required', 'request');
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ValidationError('must contain valid JSON', 'request'); }
}

function statusForError(error) { if (error instanceof ValidationError) return 400; if (error?.name === 'ServiceConfigurationError') return 503; return 502; }
function codeForError(error) { if (error instanceof ValidationError) return 'INVALID_REQUEST'; if (error?.name === 'ServiceConfigurationError') return 'SERVICE_NOT_CONFIGURED'; return 'UPSTREAM_FAILURE'; }
async function resolveCorpusStats(services) { return typeof services.getCorpusStats === 'function' ? services.getCorpusStats() : services.corpus; }
function analysisCorpus(stats) {
  if (!stats || !Array.isArray(stats.conferences)) return stats;
  const conferences = stats.conferences.map((item) => typeof item === 'string' ? item : `${item.name} ${item.year}`);
  return { conferences, paperCount: Number(stats.paperCount ?? 0) };
}

export function createRequestHandler({ services, publicDir = null, logger = console, rateLimiter = null }) {
  return async function requestHandler(request, response) {
    const requestId = randomUUID();
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (request.method === 'GET' && (url.pathname === '/api/health' || url.pathname === '/api/corpus')) {
      try {
        const corpus = await resolveCorpusStats(services);
        if (url.pathname === '/api/corpus') writeJson(response, 200, { data: corpus });
        else writeJson(response, 200, { data: { status: 'ok', mode: services.mode, corpus } });
      } catch (error) {
        logger.error?.({ requestId, code: 'CORPUS_STATS_FAILURE', errorName: error?.name ?? 'Error' });
        writeJson(response, 502, { error: { code: 'UPSTREAM_FAILURE', message: 'Corpus status is temporarily unavailable.', requestId } });
      }
      return;
    }
    if (url.pathname === '/api/analyze' && request.method !== 'POST') { writeJson(response, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST for this endpoint.', requestId } }, { allow: 'POST' }); return; }
    if (request.method === 'POST' && url.pathname === '/api/analyze') {
      if (rateLimiter !== null) {
        const clientKey = request.socket?.remoteAddress ?? 'unknown';
        const rateLimit = rateLimiter.consume(clientKey);
        if (!rateLimit.allowed) { writeJson(response, 429, { error: { code: 'RATE_LIMITED', message: 'Too many analysis requests. Try again later.', requestId } }, { 'retry-after': String(rateLimit.retryAfterSeconds) }); return; }
      }
      try {
        const body = await readJsonBody(request);
        const stats = await resolveCorpusStats(services);
        const report = await analyzeIdea(body, { ...services, corpus: analysisCorpus(stats) });
        writeJson(response, 200, { data: report });
      } catch (error) {
        const status = statusForError(error); const code = codeForError(error);
        const message = status === 400 ? error.message : status === 503 ? 'Live services are not configured. Review the server environment.' : 'The analysis service could not complete this request.';
        logger.error?.({ requestId, code, errorName: error?.name ?? 'Error' });
        writeJson(response, status, { error: { code, message, requestId } });
      }
      return;
    }
    if (publicDir !== null && (await serveStatic(request, response, publicDir, url.pathname))) return;
    writeJson(response, 404, { error: { code: 'NOT_FOUND', message: 'Resource not found.', requestId } });
  };
}
