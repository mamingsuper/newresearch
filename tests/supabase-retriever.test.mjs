import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabasePaperRetriever, SupabaseRpcClient } from '../src/retrieval/supabase-retriever.mjs';

test('embeds the query at 512 dimensions and calls the hybrid search RPC', async () => {
  const calls = [];
  const embedding = Array.from({ length: 512 }, (_, index) => index / 512);
  const retriever = new SupabasePaperRetriever({
    embeddingClient: {
      embed: async (text, options) => {
        calls.push({ type: 'embed', text, options });
        return embedding;
      },
    },
    rpcClient: {
      hybridSearch: async (payload) => {
        calls.push({ type: 'rpc', payload });
        return [
          {
            id: 'db-paper-1',
            source_record_id: 'source-1',
            conference_slug: 'ica',
            conference_name: 'ICA',
            conference_year: 2026,
            title: 'AI and Political Trust',
            abstract: 'A conference abstract about AI and political trust among young adults.',
            authors: [{ name: 'Ada Scholar', affiliation: null }],
            division: 'Political Communication',
            session_title: 'AI and Democracy',
            session_type: 'Paper Session',
            source_url: 'https://example.org/source-1',
            retrieved_at: '2026-08-21T00:00:00.000Z',
            raw_hash: 'hash-1',
            keywords: ['AI', 'political trust'],
            score: 0.032,
          },
        ];
      },
    },
  });

  const results = await retriever.search({
    query: 'How does AI affect political trust among young adults?',
    limit: 8,
  });

  assert.deepEqual(calls[0], {
    type: 'embed',
    text: 'How does AI affect political trust among young adults?',
    options: { dimensions: 512 },
  });
  assert.equal(calls[1].payload.queryText, 'How does AI affect political trust among young adults?');
  assert.equal(calls[1].payload.queryEmbedding.length, 512);
  assert.equal(calls[1].payload.matchCount, 8);
  assert.equal(results[0].paper.id, 'db-paper-1');
  assert.equal(results[0].score, 0.032);
  assert.match(results[0].evidenceExcerpt, /political trust among young adults/i);
});

test('rejects an embedding with the wrong dimensions', async () => {
  const retriever = new SupabasePaperRetriever({
    embeddingClient: { embed: async () => [0.1, 0.2] },
    rpcClient: { hybridSearch: async () => [] },
  });

  await assert.rejects(
    () => retriever.search({ query: 'A sufficiently detailed research query.', limit: 5 }),
    /512 dimensions/i,
  );
});

test('uses the apikey header without bearer auth for a Supabase secret key', async () => {
  let captured;
  const client = new SupabaseRpcClient({
    url: 'https://project.supabase.co',
    apiKey: 'sb_secret_example',
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return new Response('[]', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  await client.hybridSearch({
    queryText: 'AI and political trust',
    queryEmbedding: Array.from({ length: 512 }, () => 0),
    matchCount: 5,
  });

  assert.equal(captured.options.headers.apikey, 'sb_secret_example');
  assert.equal(captured.options.headers.authorization, undefined);
});

test('retains bearer auth for a legacy service-role JWT', async () => {
  let captured;
  const legacyKey = 'eyJ.header.payload';
  const client = new SupabaseRpcClient({
    url: 'https://project.supabase.co',
    apiKey: legacyKey,
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return new Response('[]', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  await client.hybridSearch({
    queryText: 'AI and political trust',
    queryEmbedding: Array.from({ length: 512 }, () => 0),
    matchCount: 5,
  });

  assert.equal(captured.options.headers.apikey, legacyKey);
  assert.equal(captured.options.headers.authorization, `Bearer ${legacyKey}`);
});
