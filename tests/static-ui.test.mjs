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
  assert.match(html, /href="\.\/favicon\.svg"/i);
  assert.match(html, /class="hero-layout"/i);
  assert.match(html, /class="corpus-overview"/i);
  assert.match(html, /class="console-heading"/i);
  assert.match(html, /currently indexed|corpus/i);
  assert.match(html, /href="\.\/styles\.css\?v=[^"]+"/i);
  assert.match(html, /href="\.\/results-v2\.css\?v=[^"]+"/i);
  assert.match(html, /src="\.\/config\.js"/i);
  assert.match(html, /type="module"[^>]+src="\.\/app\.js\?v=[^"]+"/i);
  assert.doesNotMatch(html, /(?:href|src)="\/(?:styles\.css|results-v2\.css|app\.js|config\.js)"/i);
});

test('browser renderer avoids unsafe HTML interpolation', async () => {
  const script = await readFile(path.join(publicDir, 'app.js'), 'utf8');
  const i18n = await readFile(path.join(publicDir, 'i18n.js'), 'utf8');

  assert.doesNotMatch(script, /innerHTML\s*=/);
  assert.match(script, /noopener/);
  assert.match(script, /t\('report\.originalProgram'\)/);
  assert.match(i18n, /'report\.originalProgram': 'Original program ↗'/);
});

test('locale changes rerender asynchronous conference-library copy', async () => {
  const script = await readFile(path.join(publicDir, 'app.js'), 'utf8');

  assert.match(script, /function\s+renderConferenceLibraryState\s*\(/);
  assert.match(script, /function\s+setLocale[\s\S]*renderConferenceLibraryState\(\)/);
  assert.match(script, /conferenceLibraryState\s*=\s*\{\s*programs,\s*statusKey:\s*'conference\.loaded'/);
});

test('analysis failures map service responses to closed dictionary keys', async () => {
  const script = await readFile(path.join(publicDir, 'app.js'), 'utf8');

  assert.doesNotMatch(script, /payload\.error/);
  assert.match(script, /showError\('error\.analysis'\)/);
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
  const analysisForm = await readFile(path.join(publicDir, 'analysis-form.js'), 'utf8');
  const i18n = await readFile(path.join(publicDir, 'i18n.js'), 'utf8');

  assert.match(html, /Map your idea to the research frontier/i);
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
  assert.match(html, /Map my idea/i);
  assert.match(html, /No global novelty claims/i);

  assert.match(styles, /--font-body:\s*1\.125rem/i);
  assert.match(styles, /\.query-hero\s*\{[\s\S]*max-width:\s*1080px/i);
  assert.match(styles, /textarea\s*\{[\s\S]*min-height:\s*240px[\s\S]*font-size:\s*var\(--font-control\)/i);

  for (const key of ['understanding', 'scope', 'embedding', 'retrieval', 'ranking', 'analysis', 'citations']) {
    assert.match(script, new RegExp(`progress\\.stage\\.${key}`));
    assert.match(i18n, new RegExp(`'progress\\.stage\\.${key}':`));
  }
  assert.match(script, /target:\s*90/);
  assert.match(script, /target:\s*94/);
  assert.doesNotMatch(script, /PROGRESS_STAGES[\s\S]*target:\s*100/);
  assert.match(script, /function\s+completeProgress\s*\(\s*\)[\s\S]*100[\s\S]*'progress\.ready'/);
  assert.match(i18n, /'progress\.ready': 'Report ready'/);
  assert.match(script, /initPublicAnalysisForm/);
  assert.match(analysisForm, /if\s*\(!response\.ok\)\s*\{/);
  assert.match(analysisForm, /payload\?\.error\?\.code/);
  assert.match(script, /onSuccess\(report\)\s*\{[\s\S]*completeProgress\(\)/);

  assert.match(styles, /--paper:\s*#f6f0e4/i);
  assert.match(styles, /--blue:\s*#2447d8/i);
  assert.match(styles, /--yellow:\s*#f6bd2f/i);
  assert.match(styles, /--green:\s*#006b4a/i);
  assert.match(styles, /--red:\s*#ff5a3d/i);
  assert.match(styles, /linear-gradient\([^)]*rgba\([^)]*\)[^)]*1px/i);

  assert.match(script, /__IDEA_RADAR_CONFIG__/);
  assert.match(script, /analyze-idea/);
  assert.match(script, /corpus-status/);
  assert.match(script, /\/api\/analyze/);
  assert.match(script, /\/api\/corpus/);
});

test('results render canonical ranked papers with full abstracts and readable citations', async () => {
  const script = await readFile(path.join(publicDir, 'app.js'), 'utf8');
  const i18n = await readFile(path.join(publicDir, 'i18n.js'), 'utf8');
  const styles = await readFile(path.join(publicDir, 'styles.css'), 'utf8');
  const resultStyles = await readFile(path.join(publicDir, 'results-v2.css'), 'utf8');

  assert.match(script, /relatedPapers/);
  assert.match(script, /function\s+renderRelatedPapers/);
  assert.match(script, /authorYearLabel/);
  assert.match(script, /paper\.abstract/);
  assert.match(script, /t\('report\.relevance'\)/);
  assert.match(i18n, /'report\.relevance': 'relevance score'/i);
  assert.match(script, /evidenceReferences/);
  assert.match(script, /data-paper-id/);
  assert.match(script, /paper-meta-row/);
  assert.match(script, /data-paper-action/);
  assert.match(script, /data-export-format/);
  assert.doesNotMatch(script, /renderClosestWork\(report\.closestWork\)/);
  assert.doesNotMatch(script, /Grounded in:[^\n]*evidencePaperIds/);
  assert.match(resultStyles, /\.related-paper-list\s*\{[\s\S]*grid-template-columns:\s*1fr/i);
  assert.match(resultStyles, /\.paper-meta-row\s*\{/i);
  assert.match(styles, /--font-body:\s*1\.125rem/i);
  assert.match(styles, /@media\s*\(max-width:\s*899px\)[\s\S]*--font-body:\s*1\.0625rem/i);
  assert.match(resultStyles, /\.paper-abstract\s*\{[\s\S]*font-size:\s*var\(--font-body\)[\s\S]*line-height:\s*1\.7/i);
});
