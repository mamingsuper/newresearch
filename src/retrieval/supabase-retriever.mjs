import { validatePaperRecord } from '../domain/schema.mjs';
import { tokenize } from './local-retriever.mjs';

export class UpstreamServiceError extends Error {
  constructor(service, message, status = null) { super(`${service}: ${message}`); this.name = 'UpstreamServiceError'; this.service = service; this.status = status; }
}

export class OpenAIEmbeddingsClient {
  constructor({ apiKey, model = 'text-embedding-3-small', fetchImpl = globalThis.fetch, baseUrl = 'https://api.openai.com/v1' }) {
    if (!apiKey) throw new TypeError('OpenAI API key is required');
    if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
    this.apiKey = apiKey; this.model = model; this.fetchImpl = fetchImpl; this.baseUrl = baseUrl.replace(/\/$/, '');
  }
  async embed(text, { dimensions = 512 } = {}) {
    const response = await this.fetchImpl(`${this.baseUrl}/embeddings`, { method: 'POST', headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: this.model, input: text, dimensions }) });
    if (!response.ok) throw new UpstreamServiceError('OpenAI embeddings', `request failed with HTTP ${response.status}`, response.status);
    const payload = await response.json(); const embedding = payload?.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) throw new UpstreamServiceError('OpenAI embeddings', 'response did not include an embedding');
    return embedding;
  }
  async embedMany(texts, { dimensions = 512 } = {}) {
    if (!Array.isArray(texts) || texts.length === 0) return [];
    const response = await this.fetchImpl(`${this.baseUrl}/embeddings`, { method: 'POST', headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: this.model, input: texts, dimensions }) });
    if (!response.ok) throw new UpstreamServiceError('OpenAI embeddings', `request failed with HTTP ${response.status}`, response.status);
    const payload = await response.json(); const vectors = payload?.data?.map((item) => item.embedding);
    if (!Array.isArray(vectors) || vectors.some((item) => !Array.isArray(item))) throw new UpstreamServiceError('OpenAI embeddings', 'response did not include embeddings');
    return vectors;
  }
}

export class SupabaseRpcClient {
  constructor({ url, apiKey, serviceRoleKey, fetchImpl = globalThis.fetch }) {
    const serverKey = apiKey ?? serviceRoleKey;
    if (!url) throw new TypeError('Supabase URL is required'); if (!serverKey) throw new TypeError('Supabase server key is required'); if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
    this.url = url.replace(/\/$/, ''); this.apiKey = serverKey; this.fetchImpl = fetchImpl;
  }
  async hybridSearch({ queryText, queryEmbedding, matchCount }) {
    const response = await this.fetchImpl(`${this.url}/rest/v1/rpc/hybrid_search_papers`, { method: 'POST', headers: { apikey: this.apiKey, ...(!this.apiKey.startsWith('sb_') ? { authorization: `Bearer ${this.apiKey}` } : {}), 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ query_text: queryText, query_embedding: queryEmbedding, match_count: matchCount }) });
    if (!response.ok) throw new UpstreamServiceError('Supabase hybrid search', `request failed with HTTP ${response.status}`, response.status);
    const payload = await response.json(); if (!Array.isArray(payload)) throw new UpstreamServiceError('Supabase hybrid search', 'response must be an array'); return payload;
  }
}

function excerpt(abstract, maxLength = 300) { const clean = String(abstract ?? '').replace(/\s+/g, ' ').trim(); return clean.length <= maxLength ? clean : `${clean.slice(0, maxLength).trim()}…`; }
function mapRow(row, query) {
  const paper = validatePaperRecord({ id: row.id, sourceRecordId: row.source_record_id, conference: { slug: row.conference_slug, name: row.conference_name, year: row.conference_year }, title: row.title, abstract: row.abstract, authors: Array.isArray(row.authors) ? row.authors : [], division: row.division, sessionTitle: row.session_title, sessionType: row.session_type, sourceUrl: row.source_url, retrievedAt: row.retrieved_at, rawHash: row.raw_hash, keywords: Array.isArray(row.keywords) ? row.keywords : [] });
  const paperTokens = new Set(tokenize(`${paper.title} ${paper.abstract} ${paper.keywords.join(' ')}`));
  return { paper, score: Number(row.score ?? 0), overlapTerms: tokenize(query).filter((term) => paperTokens.has(term)), evidenceExcerpt: excerpt(paper.abstract) };
}
export class SupabasePaperRetriever {
  constructor({ embeddingClient, rpcClient }) { this.embeddingClient = embeddingClient; this.rpcClient = rpcClient; }
  async search({ query, limit = 12 }) {
    const queryEmbedding = await this.embeddingClient.embed(query, { dimensions: 512, task: 'query' });
    if (!Array.isArray(queryEmbedding) || queryEmbedding.length !== 512) throw new Error('Embedding must contain exactly 512 dimensions.');
    const rows = await this.rpcClient.hybridSearch({ queryText: query, queryEmbedding, matchCount: Math.min(Math.max(Number(limit) || 12, 1), 30) });
    return rows.map((row) => mapRow(row, query));
  }
}
