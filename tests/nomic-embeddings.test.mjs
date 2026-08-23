import test from 'node:test';
import assert from 'node:assert/strict';
import { NomicEmbeddingsClient } from '../src/retrieval/nomic-embeddings.mjs';

function fakePipelineFactory(calls) {
  return async (task, model) => {
    calls.push({ type: 'load', task, model });
    return async (inputs, options) => {
      calls.push({ type: 'infer', inputs, options });
      const rows = Array.isArray(inputs) ? inputs : [inputs];
      return {
        tolist() {
          return rows.map((_, rowIndex) =>
            Array.from({ length: 768 }, (_, index) => (index === rowIndex ? 2 : 1)),
          );
        },
      };
    };
  };
}

test('Nomic document embeddings use search_document prefix and return normalized 512d vectors', async () => {
  const calls = [];
  const client = new NomicEmbeddingsClient({ pipelineFactory: fakePipelineFactory(calls) });

  const vectors = await client.embedMany(['Title: A\nAbstract: B'], {
    dimensions: 512,
    task: 'document',
  });

  assert.deepEqual(calls[0], {
    type: 'load',
    task: 'feature-extraction',
    model: 'nomic-ai/nomic-embed-text-v1.5',
  });
  assert.equal(calls[1].inputs[0], 'search_document: Title: A\nAbstract: B');
  assert.equal(calls[1].options.pooling, 'mean');
  assert.equal(calls[1].options.normalize, true);
  assert.equal(vectors.length, 1);
  assert.equal(vectors[0].length, 512);
  const norm = Math.sqrt(vectors[0].reduce((sum, value) => sum + value * value, 0));
  assert.ok(Math.abs(norm - 1) < 1e-9);
});

test('Nomic query embeddings use search_query prefix', async () => {
  const calls = [];
  const client = new NomicEmbeddingsClient({ pipelineFactory: fakePipelineFactory(calls) });

  const vector = await client.embed('How does AI affect political trust?', {
    dimensions: 512,
    task: 'query',
  });

  assert.equal(calls[1].inputs, 'search_query: How does AI affect political trust?');
  assert.equal(vector.length, 512);
});

test('Nomic client rejects unsupported dimensions and task values', async () => {
  const client = new NomicEmbeddingsClient({ pipelineFactory: fakePipelineFactory([]) });

  await assert.rejects(() => client.embed('query', { dimensions: 256, task: 'query' }), /512 dimensions/i);
  await assert.rejects(() => client.embed('query', { dimensions: 512, task: 'other' }), /task/i);
});
