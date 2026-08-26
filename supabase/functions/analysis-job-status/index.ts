import {
  authenticatedUserId,
  corsHeaders,
  jsonResponse,
  originAllowed,
  rpc,
} from '../_shared/idea-radar.ts';
import { pollApodexResearch } from '../_shared/apodex-research.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeUrl(value: unknown): string {
  try {
    const url = new URL(String(value ?? ''));
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    return url.href;
  } catch {
    return '';
  }
}

function boundedText(value: unknown, maxLength: number): string {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength);
}

function corpusSources(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).map((candidate, index) => {
    const paper = candidate && typeof candidate === 'object'
      ? candidate as Record<string, unknown>
      : {};
    return {
      sourceId: `C${index + 1}`,
      paperId: boundedText(paper.paperId, 120),
      title: boundedText(paper.title, 500),
      conference: boundedText(paper.conference, 160),
      abstract: boundedText(paper.abstract, 20_000),
      sourceUrl: safeUrl(paper.sourceUrl),
    };
  });
}

async function entitlementRemaining(userId: string) {
  const raw = await rpc('get_analysis_entitlement_status', { target_user_id: userId });
  const row = Array.isArray(raw) ? raw[0] : raw;
  return row && typeof row === 'object'
    ? Math.max(0, Number((row as Record<string, unknown>).super_remaining ?? 0))
    : 0;
}

function payload(job: Record<string, unknown>, superRemaining: number, result: Record<string, unknown> | null = null) {
  return {
    jobId: String(job.id),
    status: String(job.status),
    model: 'super_apodex',
    matchCount: Number(job.match_count),
    progress: {
      stage: String(job.status),
      message: job.status === 'queued' ? 'Preparing the evidence set'
        : job.status === 'completed' ? 'Deep research complete'
        : job.status === 'failed' ? 'Deep research could not be completed'
        : 'Searching and synthesizing evidence',
    },
    reportMarkdown: null,
    corpusSources: corpusSources(job.retrieved_papers),
    webSources: [],
    researchActions: [],
    superRemaining,
    ...(result ?? {}),
  };
}

async function handle(req: Request): Promise<Response> {
  const origin = req.headers.get('origin');
  if (!originAllowed(origin)) {
    return jsonResponse({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin not allowed.' } }, 403, null, 'no-store');
  }
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin, 'GET, OPTIONS') });
  }
  if (req.method !== 'GET') {
    return jsonResponse({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET for this endpoint.' } }, 405, origin, 'no-store', { Allow: 'GET, OPTIONS' });
  }

  try {
    const userId = await authenticatedUserId(req);
    if (!userId) {
      return jsonResponse({ error: { code: 'AUTH_REQUIRED', message: 'Sign in to view this research job.' } }, 401, origin, 'no-store');
    }
    const jobId = new URL(req.url).searchParams.get('id') ?? '';
    if (!UUID_PATTERN.test(jobId)) {
      return jsonResponse({ error: { code: 'INVALID_REQUEST', message: 'A valid job id is required.' } }, 400, origin, 'no-store');
    }

    const raw = await rpc('get_analysis_job', {
      target_user_id: userId,
      target_job_id: jobId,
    });
    const job = Array.isArray(raw) ? raw[0] : raw;
    if (!job || typeof job !== 'object') {
      return jsonResponse({ error: { code: 'JOB_NOT_FOUND', message: 'This research job was not found.' } }, 404, origin, 'no-store');
    }
    const record = job as Record<string, unknown>;
    const superRemaining = await entitlementRemaining(userId);

    if (record.status === 'completed' && record.result && typeof record.result === 'object') {
      return jsonResponse({ data: payload(record, superRemaining, record.result as Record<string, unknown>) }, 200, origin, 'no-store');
    }
    if (record.status === 'failed') {
      return jsonResponse({
        data: payload(record, superRemaining, { errorCode: boundedText(record.error_code || 'SUPER_RESEARCH_FAILED', 64) }),
      }, 200, origin, 'no-store');
    }
    if (typeof record.provider_response_id !== 'string' || !record.provider_response_id) {
      return jsonResponse({ data: payload(record, superRemaining) }, 200, origin, 'no-store');
    }

    const provider = await pollApodexResearch(record.provider_response_id);
    if (provider.status === 'completed') {
      const result = {
        reportMarkdown: provider.reportMarkdown,
        corpusSources: corpusSources(record.retrieved_papers),
        webSources: provider.webSources,
        researchActions: provider.researchActions,
      };
      await rpc('complete_analysis_job', {
        target_user_id: userId,
        target_job_id: jobId,
        target_result: result,
      });
      return jsonResponse({
        data: payload({ ...record, status: 'completed' }, superRemaining, result),
      }, 200, origin, 'no-store');
    }
    if (provider.status === 'failed') {
      await rpc('fail_analysis_job', {
        target_user_id: userId,
        target_job_id: jobId,
        target_error_code: 'APODEX_RESEARCH_FAILED',
      });
      return jsonResponse({
        data: payload({ ...record, status: 'failed' }, superRemaining, { errorCode: 'APODEX_RESEARCH_FAILED' }),
      }, 200, origin, 'no-store');
    }

    return jsonResponse({
      data: payload(
        { ...record, status: provider.status },
        superRemaining,
        { webSources: provider.webSources, researchActions: provider.researchActions },
      ),
    }, 200, origin, 'no-store');
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (/^apodex_provider_(429|5\d\d)$/.test(code)) {
      return jsonResponse({ error: { code: 'UPSTREAM_BUSY', message: 'Deep research is still busy. Try again shortly.' } }, 503, origin, 'no-store', { 'Retry-After': '5' });
    }
    return jsonResponse({ error: { code: 'JOB_STATUS_UNAVAILABLE', message: 'The research status is temporarily unavailable.' } }, 503, origin, 'no-store');
  }
}

Deno.serve(handle);
