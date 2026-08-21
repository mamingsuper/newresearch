import { MockIdeaAnalyzer } from '../analysis/mock-analyzer.mjs';
import { OpenAIAnalyzer } from '../analysis/openai-analyzer.mjs';
import { SAMPLE_PAPERS } from '../fixtures/sample-papers.mjs';
import { LocalPaperRetriever } from '../retrieval/local-retriever.mjs';
import {
  OpenAIEmbeddingsClient,
  SupabasePaperRetriever,
  SupabaseRpcClient,
} from '../retrieval/supabase-retriever.mjs';
import { TavilyClient } from '../tavily/client.mjs';

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

function liveCorpus(env) {
  const conferences = (env.CORPUS_CONFERENCES ?? 'ICA 2026,APSA 2026')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const parsedCount = Number.parseInt(env.CORPUS_PAPER_COUNT ?? '0', 10);
  return {
    conferences,
    paperCount: Number.isFinite(parsedCount) && parsedCount >= 0 ? parsedCount : 0,
  };
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
        conferences: ['ICA 2026 demo', 'APSA 2026 demo'],
        paperCount: SAMPLE_PAPERS.length,
      },
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
  const embeddingClient = new OpenAIEmbeddingsClient({
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
    fetchImpl,
  });
  const rpcClient = new SupabaseRpcClient({
    url: env.SUPABASE_URL,
    apiKey: supabaseServerKey,
    fetchImpl,
  });
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
    corpus: liveCorpus(env),
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
