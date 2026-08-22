import { buildEmbeddingText } from './embedding-text.mjs';

const TRANSIENT = new Set([408, 409, 429, 500, 502, 503, 504]);

export function retryDelaySeconds(attempts, baseSeconds = 30) {
  const power = Math.max(0, Number(attempts) - 1);
  return Math.min(baseSeconds * (2 ** power), 3600);
}

function safeErrorCode(error) {
  const status = Number(error?.status ?? 0);
  if (status === 429) return 'provider_rate_limited';
  if (status === 408 || error?.name === 'AbortError') return 'provider_timeout';
  if (status >= 500) return 'provider_unavailable';
  if (status >= 400) return 'provider_rejected';
  return 'provider_error';
}

function isTransient(error) {
  const status = Number(error?.status ?? 0);
  return TRANSIENT.has(status) || error?.name === 'AbortError' || error?.code === 'ECONNRESET';
}

function paperFromJob(job) {
  return {
    title: job.title,
    abstract: job.abstract,
    conference: { name: job.conferenceName, year: job.conferenceYear },
    division: job.division,
    keywords: job.keywords ?? [],
  };
}

async function releaseJobs(jobs, store, { errorCode, transient, maxAttempts, now }) {
  let retried = 0;
  let failed = 0;
  for (const job of jobs) {
    const terminal = !transient || Number(job.attempts) >= maxAttempts;
    const code = terminal && transient ? 'max_attempts_exceeded' : errorCode;
    const nextAttemptAt = new Date(now().getTime() + retryDelaySeconds(job.attempts) * 1000).toISOString();
    await store.releaseEmbeddingJob({ paperId: job.paperId, inputHash: job.inputHash, errorCode: code, nextAttemptAt, terminal });
    if (terminal) failed += 1;
    else retried += 1;
  }
  return { retried, failed };
}

export async function processEmbeddingBatch({
  store,
  embeddingClient,
  batchSize = 64,
  leaseSeconds = 300,
  maxAttempts = 5,
  now = () => new Date(),
} = {}) {
  const jobs = await store.claimEmbeddingJobs({ batchSize, leaseSeconds });
  const result = { claimed: jobs.length, completed: 0, retried: 0, failed: 0, stale: 0 };
  if (jobs.length === 0) return result;

  let vectors;
  try {
    vectors = await embeddingClient.embedMany(jobs.map((job) => buildEmbeddingText(paperFromJob(job))), { dimensions: 512 });
  } catch (error) {
    const released = await releaseJobs(jobs, store, {
      errorCode: safeErrorCode(error), transient: isTransient(error), maxAttempts, now,
    });
    result.retried += released.retried;
    result.failed += released.failed;
    return result;
  }

  if (!Array.isArray(vectors) || vectors.length !== jobs.length || vectors.some((vector) => !Array.isArray(vector) || vector.length !== 512)) {
    const released = await releaseJobs(jobs, store, {
      errorCode: 'invalid_embedding_dimensions', transient: false, maxAttempts, now,
    });
    result.failed += released.failed;
    return result;
  }

  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    const completed = await store.completeEmbeddingJob({
      paperId: job.paperId,
      inputHash: job.inputHash,
      model: job.model,
      embedding: vectors[index],
    });
    if (completed === false) result.stale += 1;
    else result.completed += 1;
  }
  return result;
}
