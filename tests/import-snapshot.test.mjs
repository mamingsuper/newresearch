import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'scripts', 'import-snapshot.mjs');

function runNode(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('imports an APSA snapshot as canonical NDJSON without printing abstracts', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'radar-import-'));
  const input = path.join(directory, 'apsa.json');
  const output = path.join(directory, 'papers.ndjson');
  const secretAbstract = 'A SECRET abstract about generative AI and political trust.';
  await writeFile(
    input,
    JSON.stringify({
      papers: [
        {
          id: 'apsa-test-1',
          title: '(Paper) Generative AI and Trust',
          abstract: secretAbstract,
          authors: [{ name: 'Ada Scholar', affiliation: 'Example University' }],
          division: 'Political Communication',
          sessionTitle: 'AI and Democracy',
          sessionType: 'Panel',
          directUrl: 'https://example.org/apsa-test-1',
        },
      ],
    }),
  );

  const result = await runNode([
    script,
    '--source', 'apsa',
    '--input', input,
    '--output', output,
  ]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Imported 1 APSA record/i);
  assert.doesNotMatch(result.stdout, new RegExp(secretAbstract));
  const lines = (await readFile(output, 'utf8')).trim().split('\n');
  assert.equal(lines.length, 1);
  const paper = JSON.parse(lines[0]);
  assert.equal(paper.id, 'apsa-2026-apsa-test-1');
  assert.equal(paper.sourceUrl, 'https://example.org/apsa-test-1');
  assert.match(paper.rawHash, /^[a-f0-9]{64}$/);
});

test('fails clearly for an unsupported source adapter', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'radar-import-'));
  const input = path.join(directory, 'records.json');
  const output = path.join(directory, 'papers.ndjson');
  await writeFile(input, '[]');

  const result = await runNode([
    script,
    '--source', 'unknown',
    '--input', input,
    '--output', output,
  ]);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /unsupported source/i);
});
