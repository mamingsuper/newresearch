import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequestHandler } from '../src/app/create-app.mjs';
import { LocalPaperRetriever } from '../src/retrieval/local-retriever.mjs';
import { MockIdeaAnalyzer } from '../src/analysis/mock-analyzer.mjs';
import { SAMPLE_PAPERS } from '../src/fixtures/sample-papers.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');

test('workbench HTML exposes the required accessible landmarks and Pages-safe assets', async () => {
  const html = await readFile(path.join(publicDir, 'index.html'), 'utf8');

  assert.match(html, /<textarea[^>]+id="idea-input"/i);
  assert.match(html, /id="analysis-form"/i);
  assert.match(html, /id="report-root"/i);
  assert.match(html, /currently indexed|corpus/i);
  assert.match(html, /href="\.\/styles\.css"/i);
  assert.match(html, /src="\.\/config\.js"/i);
  assert.match(html, /type="module"[^>]+src="\.\/app\.js"/i);
  assert.doesNotMatch(html, /(?:href|src)="\/(?:styles\.css|app\.js|config\.js)"/i);
});

test('browser renderer avoids unsafe HTML interpolation', async () => {
  const script = await readFile(path.join(publicDir, 'app.js'), 'utf8');

  assert.doesNotMatch(script, /innerHTML\s*=/);
  assert.match(script, /noopener/);
  assert.match(script, /Original program/);
});

test('server serves the workbench and blocks path traversal', async () => {
  const services = {
    mode: 'mock',
    retriever: new LocalPaperRetriever(SAMPLE_PAPERS),
    analyzer: new MockIdeaAnalyzer(),
    corpus: { conferences: ['ICA 2026', 'APSA 2026'], paperCount: SAMPLE_PAPERS.length },
  };
  const server = createServer(createRequestHandler({ services, publicDir }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const home = await fetch(`${baseUrl}/`);
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-type'), /text\/html/);
    assert.match(await home.text(), /Research Frontier Radar/);

    const traversal = await fetch(`${baseUrl}/..%2Fpackage.json`);
    assert.equal(traversal.status, 404);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('idea radar landing page is a centered query-first research workbench', async () => {
  const html = await readFile(path.join(publicDir, 'index.html'), 'utf8');
  const styles = await readFile(path.join(publicDir, 'styles.css'), 'utf8');
  const script = await readFile(path.join(publicDir, 'app.js'), 'utf8');

  assert.match(html, /Scan your research idea against the frontier/i);
  assert.match(html, /APSA 2026/);
  assert.match(html, /5,493 papers/);
  assert.match(html, /ICA 2026/);
  assert.match(html, /3,413 papers/);
  assert.match(html, /8,906 abstracts/);
  assert.match(html, /id="corpus-ledger"/i);
  assert.match(html, /id="search-progress"/i);
  assert.match(html, /id="progress-bar"/i);
  assert.match(html, /id="progress-percent"/i);
  assert.match(html, /id="progress-stage"/i);
  assert.doesNotMatch(html, /id="live-workbench"/i);
  assert.match(html, /Start Testing/i);
  assert.match(html, /No global novelty claims/i);

  assert.match(styles, /body\s*\{[\s\S]*font-size:\s*16px/i);
  assert.match(styles, /\.query-hero\s*\{[\s\S]*max-width:\s*1080px/i);
  assert.match(styles, /textarea\s*\{[\s\S]*min-height:\s*240px[\s\S]*font-size:\s*1\.125rem/i);

  assert.match(script, /Understanding the research question/);
  assert.match(script, /Reading corpus scope: APSA 2026 \+ ICA 2026/);
  assert.match(script, /Generating the query embedding/);
  assert.match(script, /Hybrid vector \+ full-text retrieval/);
  assert.match(script, /Ranking the most relevant papers/);
  assert.match(script, /Generating evidence-grounded analysis/);
  assert.match(script, /Finalizing grounded citations/);
  assert.match(script, /target:\s*90/);
  assert.match(script, /target:\s*94/);
  assert.doesNotMatch(script, /PROGRESS_STAGES[\s\S]*target:\s*100/);
  assert.match(script, /function\s+completeProgress\s*\(\s*\)[\s\S]*100[\s\S]*Report ready/);
  assert.match(script, /if\s*\(!response\.ok\)[\s\S]*throw[\s\S]*completeProgress\(\)/);

  assert.match(styles, /--paper:\s*#f6f0e4/i);
  assert.match(styles, /--blue:\s*#2f5bff/i);
  assert.match(styles, /--yellow:\s*#f6bd2f/i);
  assert.match(styles, /--green:\s*#079c6a/i);
  assert.match(styles, /--red:\s*#ff5a3d/i);
  assert.match(styles, /linear-gradient\([^)]*rgba\([^)]*\)[^)]*1px/i);

  assert.match(script, /__IDEA_RADAR_CONFIG__/);
  assert.match(script, /analyze-idea/);
  assert.match(script, /corpus-status/);
  assert.match(script, /\/api\/analyze/);
  assert.match(script, /\/api\/corpus/);
});