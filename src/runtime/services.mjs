import { MockIdeaAnalyzer } from '../analysis/mock-analyzer.mjs';
import { OpenAIAnalyzer } from '../analysis/openai-analyzer.mjs';
import { SAMPLE_PAPERS } from '../fixtures/sample-papers.mjs';
import { LocalPaperRetriever } from '../retrieval/local-retriever.mjs';
import { NomicEmbeddingsClient } from '../retrieval/nomic-embeddings.mjs';
import {
  SupabasePaperRetriever,
  SupabaseRpcClient,
} from '../retrieval/supabase-retriever.mjs';
import { TavilyClient } from '../tavily/client.mjs';
import { SupabaseCorpusClient } from '../supabase/corpus-client.mjs';

export class ServiceConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ServiceConfigurationError';
  }
}

function required(env, names) {
  const missing = names.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new ServiceConfigurationError(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

function optionalPositiveInteger(env, name, fallback) {
  if (!env[name]?.trim()) return fallback;
  const parsed = Number.parseInt(env[name], 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ServiceConfigurationError(`${name} must be a positive integer.`);
  }
  return parsed;
}

export function createServices(env = process.env, { fetchImpl = globalThis.fetch } = {}) {
  const mode = (env.APP_MODE ?? 'mock').trim().toLowerCase();
  if (mode === 'mock') {
    return {
      mode,
      retriever: new LocalPaperRetriever(SAMPLE_PAPERS),
      analyzer: new MockIdeaAnalyzer(),
      corpus: {
        conferences: [
          { slug: 'ica', name: 'ICA', year: 2026, papers: SAMPLE_PAPERS.filter((paper) => paper.conference.slug === 'ica').length },
          { slug: 'apsa', name: 'APSA', year: 2026, papers: SAMPLE_PAPERS.filter((paper) => paper.conference.slug === 'apsa').length },
        ],
        paperCount: SAMPLE_PAPERS.length,
        papersWithAbstract: SAMPLE_PAPERS.length,
        embeddedPaperCount: SAMPLE_PAPERS.length,
        pendingEmbeddingCount: 0,
        failedEmbeddingCount: 0,
        latestSuccessfulIngestionAt: null,
        ready: true,
      },
      getCorpusStats: async function getCorpusStats() { return this.corpus; },
    };
  }
  if (mode !== 'live') {
    throw new ServiceConfigurationError('APP_MODE must be either "mock" or "live".');
  }

  required(env, ['OPENAI_API_KEY', 'SUPABASE_URL']);
  const supabaseServerKey = env.SUPABASE_SECRET_KEY?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseServerKey) {
    throw new ServiceConfigurationError(
      'Missing required environment variable: SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY)',
    );
  }
  const embeddingClient = new NomicEmbeddingsClient({
    model: env.NOMIC_EMBEDDING_MODEL ?? 'nomic-ai/nomic-embed-text-v1.5',
  });
  const rpcClient = new SupabaseRpcClient({
    url: env.SUPABASE_URL,
    apiKey: supabaseServerKey,
    fetchImpl,
  });
  const corpusClient = new SupabaseCorpusClient({
    url: env.SUPABASE_URL,
    apiKey: supabaseServerKey,
    fetchImpl,
  });
  let cachedCorpus = null;
  let cachedCorpusAt = 0;
  const getCorpusStats = async () => {
    const now = Date.now();
    if (cachedCorpus && now - cachedCorpusAt < 60_000) return cachedCorpus;
    cachedCorpus = await corpusClient.getCorpusStats();
    cachedCorpusAt = now;
    return cachedCorpus;
  };
  return {
    mode,
    retriever: new SupabasePaperRetriever({ embeddingClient, rpcClient }),
    analyzer: new OpenAIAnalyzer({
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_ANALYSIS_MODEL ?? 'gpt-5-mini',
      maxOutputTokens: optionalPositiveInteger(
        env,
        'OPENAI_MAX_OUTPUT_TOKENS',
        1800,
      ),
      fetchImpl,
    }),
    corpus: { conferences: [], paperCount: 0, papersWithAbstract: 0, embeddedPaperCount: 0, pendingEmbeddingCount: 0, failedEmbeddingCount: 0, latestSuccessfulIngestionAt: null, ready: false },
    getCorpusStats,
  };
}

export function createTavilyClient(env = process.env, { fetchImpl = globalThis.fetch } = {}) {
  required(env, ['TAVILY_API_KEY']);
  return new TavilyClient({
    apiKey: env.TAVILY_API_KEY,
    projectId: env.TAVILY_PROJECT ?? 'research-frontier-radar',
    fetchImpl,
  });
}
