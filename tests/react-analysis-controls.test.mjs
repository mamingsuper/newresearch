import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../frontend/src/', import.meta.url);

test('analysis UI exposes enforced free and Pro evidence depths plus locked SUPER explanation', async () => {
  const [page, composer, context, paywall] = await Promise.all([
    readFile(new URL('pages/NewAnalysis.tsx', root), 'utf8'),
    readFile(new URL('components/AnalysisComposer.tsx', root), 'utf8'),
    readFile(new URL('context/AppContext.tsx', root), 'utf8'),
    readFile(new URL('components/PaywallModal.tsx', root), 'utf8'),
  ]);
  const controls = `${page}\n${composer}`;
  assert.match(controls, /super_apodex/);
  assert.match(controls, /SUPER:Apodex/);
  assert.match(controls, /matchCount/);
  assert.match(controls, /externalProcessingConsent/);
  assert.match(controls, /Apodex/);
  assert.match(controls, /superRemaining/);
  assert.match(controls, /Upload files|上传文件/);
  assert.match(controls, /composer-model-menu/);
  assert.match(controls, /Model selection|模型选择/);
  assert.doesNotMatch(controls, /setPanel\("effort"\)/);
  assert.doesNotMatch(controls, /composer-meta-row/);
  assert.match(paywall, /SUPER|Apodex/);
  assert.match(context, /analysisOptions/);
});

test('analysis adapter persists jobs, polls status, and preserves complete reports and citations', async () => {
  const [adapter, results] = await Promise.all([
    readFile(new URL('adapters/analysis.ts', root), 'utf8'),
    readFile(new URL('pages/AnalysisResults.tsx', root), 'utf8'),
  ]);
  assert.match(adapter, /analyze-idea/);
  assert.match(adapter, /analysis-job-status/);
  assert.match(adapter, /sessionStorage/);
  assert.match(adapter, /clientRequestId/);
  assert.match(adapter, /reportMarkdown/);
  assert.doesNotMatch(adapter, /MOCK_REPORT|Math\.random/);
  assert.match(results, /reportMarkdown/);
  assert.match(results, /corpusSources/);
  assert.match(results, /webSources/);
  assert.doesNotMatch(results, /\.slice\([^)]*reportMarkdown/);
});
