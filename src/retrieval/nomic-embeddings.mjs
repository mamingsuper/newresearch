const DEFAULT_MODEL = 'nomic-ai/nomic-embed-text-v1.5';
const PREFIX = { document: 'search_document', query: 'search_query' };

function validateOptions({ dimensions, task }) {
  if (dimensions !== 512) throw new RangeError('Nomic embeddings require exactly 512 dimensions.');
  if (!Object.hasOwn(PREFIX, task)) throw new TypeError('Nomic embedding task must be "document" or "query".');
}

function normalize512(vector) {
  if (!Array.isArray(vector) || vector.length < 512) {
    throw new Error('Nomic embedding output must contain at least 512 dimensions.');
  }
  const truncated = vector.slice(0, 512).map(Number);
  const norm = Math.sqrt(truncated.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm === 0) throw new Error('Nomic embedding output cannot be normalized.');
  return truncated.map((value) => value / norm);
}

async function defaultPipelineFactory(task, model) {
  const { pipeline } = await import('@huggingface/transformers');
  return pipeline(task, model);
}

export class NomicEmbeddingsClient {
  constructor({ model = DEFAULT_MODEL, pipelineFactory = defaultPipelineFactory } = {}) {
    this.model = model;
    this.pipelineFactory = pipelineFactory;
    this.pipelinePromise = null;
  }

  async getPipeline() {
    this.pipelinePromise ??= this.pipelineFactory('feature-extraction', this.model);
    return this.pipelinePromise;
  }

  async embed(text, { dimensions = 512, task = 'query' } = {}) {
    validateOptions({ dimensions, task });
    const pipe = await this.getPipeline();
    const output = await pipe(`${PREFIX[task]}: ${text}`, { pooling: 'mean', normalize: true });
    const rows = output.tolist();
    const vector = Array.isArray(rows?.[0]) ? rows[0] : rows;
    return normalize512(vector);
  }

  async embedMany(texts, { dimensions = 512, task = 'document' } = {}) {
    validateOptions({ dimensions, task });
    if (!Array.isArray(texts) || texts.length === 0) return [];
    const pipe = await this.getPipeline();
    const output = await pipe(texts.map((text) => `${PREFIX[task]}: ${text}`), {
      pooling: 'mean',
      normalize: true,
    });
    const rows = output.tolist();
    if (!Array.isArray(rows) || rows.length !== texts.length) {
      throw new Error('Nomic embedding response count did not match the input count.');
    }
    return rows.map(normalize512);
  }
}

export { DEFAULT_MODEL as NOMIC_EMBEDDING_MODEL };
