export async function refreshCorpus({ validate, load, embed, stats }) {
  if (![validate, load, embed, stats].every((fn) => typeof fn === 'function')) {
    throw new TypeError('validate, load, embed, and stats functions are required');
  }
  const validation = await validate();
  const loadResult = await load(validation);
  const embeddingBatches = [];
  while (true) {
    const batch = await embed();
    embeddingBatches.push(batch);
    if (!batch || Number(batch.claimed ?? 0) === 0) break;
  }
  const corpusStats = await stats();
  return { validation, load: loadResult, embeddingBatches, stats: corpusStats };
}
