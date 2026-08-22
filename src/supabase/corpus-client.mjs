import { UpstreamServiceError } from '../retrieval/supabase-retriever.mjs';
import { validateCorpusStats } from '../corpus/stats.mjs';

function authHeaders(apiKey) {
  return {
    apikey: apiKey,
    ...(!apiKey.startsWith('sb_') ? { authorization: `Bearer ${apiKey}` } : {}),
    'content-type': 'application/json',
    accept: 'application/json',
  };
}

function eq(value) {
  return `eq.${encodeURIComponent(String(value))}`;
}

export class SupabaseCorpusClient {
  constructor({ url, apiKey, serviceRoleKey, fetchImpl = globalThis.fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
    const key = apiKey ?? serviceRoleKey;
    if (!url) throw new TypeError('Supabase URL is required');
    if (!key) throw new TypeError('Supabase server key is required');
    this.url = url.replace(/\/$/, '');
    this.apiKey = key;
    this.fetchImpl = fetchImpl;
    this.sleep = sleep;
  }

  async request(path, { method = 'GET', body, prefer } = {}) {
    let lastResponse;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await this.fetchImpl(`${this.url}/rest/v1/${path}`, {
        method,
        headers: { ...authHeaders(this.apiKey), ...(prefer ? { prefer } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      lastResponse = response;
      if (response.ok) {
        if (response.status === 204) return null;
        const text = await response.text();
        return text ? JSON.parse(text) : null;
      }
      const transient = [429, 502, 503, 504].includes(response.status);
      if (!transient || attempt === 3) break;
      await this.sleep(100 * (2 ** (attempt - 1)));
    }
    throw new UpstreamServiceError('Supabase corpus', `request failed with HTTP ${lastResponse.status}`, lastResponse.status);
  }

  async startIngestionRun({ sourceAdapter, sourceLabel, inputSha256, totalRecords }) {
    const rows = await this.request('ingestion_runs', {
      method: 'POST', prefer: 'return=representation',
      body: [{ source_adapter: sourceAdapter, source_label: sourceLabel, input_sha256: inputSha256, status: 'started', total_records: totalRecords }],
    });
    return { id: rows[0].id };
  }

  async getPaperState(paper) {
    const query = `papers?select=id,raw_hash,embedding_input_hash&conference_slug=${eq(paper.conference.slug)}&conference_year=${eq(paper.conference.year)}&source_record_id=${eq(paper.sourceRecordId)}&limit=1`;
    const rows = await this.request(query);
    const row = rows?.[0];
    return row ? { id: row.id, rawHash: row.raw_hash, embeddingInputHash: row.embedding_input_hash } : null;
  }

  async upsertPaper(input) {
    const row = {
      ...(input.id ? { id: input.id } : {}),
      source_record_id: input.sourceRecordId,
      conference_slug: input.conference.slug,
      conference_name: input.conference.name,
      conference_year: input.conference.year,
      title: input.title,
      abstract: input.abstract,
      authors: input.authors,
      division: input.division,
      session_title: input.sessionTitle,
      session_type: input.sessionType,
      keywords: input.keywords,
      source_url: input.sourceUrl,
      retrieved_at: input.retrievedAt,
      raw_hash: input.rawHash,
      embedding_input_hash: input.embeddingInputHash,
      last_ingestion_run_id: input.lastIngestionRunId,
      ...(input.clearEmbedding ? { embedding: null, embedding_model: null, embedding_dimensions: null, embedding_updated_at: null } : {}),
    };
    const rows = await this.request('papers?on_conflict=conference_slug,conference_year,source_record_id', {
      method: 'POST', prefer: 'resolution=merge-duplicates,return=representation', body: [row],
    });
    return { id: rows[0].id };
  }

  async upsertEmbeddingJob({ paperId, inputHash, model, dimensions }) {
    await this.request('embedding_jobs?on_conflict=paper_id', {
      method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
      body: [{ paper_id: paperId, input_hash: inputHash, model, dimensions, status: 'pending', attempts: 0, next_attempt_at: new Date().toISOString(), lease_expires_at: null, last_error_code: null, completed_at: null }],
    });
  }

  async recordRejections(items) {
    if (!Array.isArray(items) || items.length === 0) return;
    await this.request('ingestion_rejections', {
      method: 'POST', prefer: 'return=minimal',
      body: items.map((item) => ({
        ingestion_run_id: item.ingestionRunId,
        source_record_id: item.sourceRecordId ?? null,
        reason_code: item.reasonCode,
        safe_detail: item.safeDetail ?? null,
      })),
    });
  }

  async completeIngestionRun({ runId, counts }) {
    await this.request(`ingestion_runs?id=${eq(runId)}`, { method: 'PATCH', prefer: 'return=minimal', body: {
      status: 'completed', completed_at: new Date().toISOString(), inserted_records: counts.inserted,
      updated_records: counts.updated, unchanged_records: counts.unchanged, rejected_records: counts.rejected,
      embedding_jobs_created: counts.embeddingJobsCreated,
    } });
  }

  async failIngestionRun({ runId, errorCode, counts }) {
    await this.request(`ingestion_runs?id=${eq(runId)}`, { method: 'PATCH', prefer: 'return=minimal', body: {
      status: 'failed', completed_at: new Date().toISOString(), error_code: String(errorCode).slice(0, 120),
      inserted_records: counts.inserted, updated_records: counts.updated, unchanged_records: counts.unchanged,
      rejected_records: counts.rejected, embedding_jobs_created: counts.embeddingJobsCreated,
    } });
  }

  async claimEmbeddingJobs({ batchSize = 64, leaseSeconds = 300 } = {}) {
    const rows = (await this.request('rpc/claim_embedding_jobs', { method: 'POST', body: { batch_size: batchSize, lease_seconds: leaseSeconds } })) ?? [];
    return rows.map((row) => ({
      paperId: row.paper_id, inputHash: row.input_hash, model: row.model, dimensions: row.dimensions, attempts: row.attempts,
      title: row.title, abstract: row.abstract, conferenceName: row.conference_name, conferenceYear: row.conference_year, division: row.division, keywords: row.keywords ?? [],
    }));
  }

  async completeEmbeddingJob({ paperId, inputHash, model, embedding }) {
    return this.request('rpc/complete_embedding_job', { method: 'POST', body: { target_paper_id: paperId, target_input_hash: inputHash, target_model: model, target_embedding: embedding } });
  }

  async releaseEmbeddingJob({ paperId, inputHash, errorCode, nextAttemptAt, terminal }) {
    return this.request('rpc/release_embedding_job', { method: 'POST', body: { target_paper_id: paperId, target_input_hash: inputHash, error_code: errorCode, next_attempt: nextAttemptAt, terminal } });
  }

  async getCorpusStats() {
    const value = await this.request('rpc/get_corpus_stats', { method: 'POST', body: {} });
    return validateCorpusStats(value);
  }
}
