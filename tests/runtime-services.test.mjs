import test from 'node:test';
import assert from 'node:assert/strict';
import { createServices, ServiceConfigurationError } from '../src/runtime/services.mjs';
import { LocalPaperRetriever } from '../src/retrieval/local-retriever.mjs';
import { MockIdeaAnalyzer } from '../src/analysis/mock-analyzer.mjs';

test('mock mode constructs local services without credentials', () => {
  const services = createServices({ APP_MODE: 'mock' });

  assert.equal(services.mode, 'mock');
  assert.ok(services.retriever instanceof LocalPaperRetriever);
  assert.ok(services.analyzer instanceof MockIdeaAnalyzer);
  assert.ok(services.corpus.paperCount > 0);
});

test('live mode fails explicitly when credentials are missing', () => {
  assert.throws(
    () => createServices({ APP_MODE: 'live' }),
    ServiceConfigurationError,
  );
});

test('an unsupported mode does not silently fall back to mock', () => {
  assert.throws(
    () => createServices({ APP_MODE: 'automatic' }),
    /APP_MODE/i,
  );
});

test('live mode accepts the current Supabase server secret key', () => {
  const services = createServices({
    APP_MODE: 'live',
    OPENAI_API_KEY: 'openai-test',
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SECRET_KEY: 'sb_secret_example',
  });

  assert.equal(services.mode, 'live');
});

test('live mode still accepts the legacy Supabase service-role key', () => {
  const services = createServices({
    APP_MODE: 'live',
    OPENAI_API_KEY: 'openai-test',
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'eyJ.header.payload',
  });

  assert.equal(services.mode, 'live');
});
