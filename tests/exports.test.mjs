import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  downloadExport,
  exportConversation,
  exportPapers,
} from '../public/exports.js';

const paper = {
  paperId: '11111111-1111-4111-8111-111111111111',
  title: '=HYPERLINK("x")',
  abstract: 'a,"b"',
  authors: [{ name: 'Doe, Jane' }],
  conferenceName: 'ICA',
  conferenceYear: 2026,
  division: 'Political Communication',
  keywords: ['trust', 'AI'],
  sourceUrl: 'https://example.org/program?id=1',
  note: '@private formula',
  tags: ['core'],
  embedding: [1, 2, 3],
  service_role: 'bad',
};

test('CSV quotes commas, quotes, and formula-leading cells', () => {
  const result = exportPapers([paper], 'csv');
  assert.equal(result.filename, 'papers.csv');
  assert.match(result.content, /^title,authors,abstract,/);
  assert.match(result.content, /"'=HYPERLINK\(""x""\)"/);
  assert.match(result.content, /"a,""b"""/);
  assert.match(result.content, /"'@private formula"/);
});

test('exports omit internal identifiers, vectors, and secrets', () => {
  for (const format of ['csv', 'bibtex', 'markdown']) {
    const content = exportPapers([paper], format).content;
    assert.doesNotMatch(content, /11111111|embedding|service_role|bad/i);
  }
});

test('BibTeX keys are stable, collision-safe, and contain allowlisted paper fields', () => {
  const papers = [
    { ...paper, title: 'Trust & AI' },
    { ...paper, paperId: '22222222-2222-4222-8222-222222222222', title: 'Trust in AI' },
  ];
  const first = exportPapers(papers, 'bibtex');
  const second = exportPapers(papers, 'bibtex');
  assert.equal(first.content, second.content);
  assert.match(first.content, /@inproceedings\{doe2026trust,/);
  assert.match(first.content, /@inproceedings\{doe2026trust2,/);
  assert.match(first.content, /booktitle = \{ICA\}/);
  assert.match(first.content, /url = \{https:\/\/example\.org\/program\?id=1\}/);
});

test('Markdown accepts only HTTP source URLs and escapes markup-bearing values', () => {
  const safe = exportPapers([{ ...paper, title: '[Trust](bad)', sourceUrl: 'https://example.org/a_(b)' }], 'markdown');
  assert.match(safe.content, /\\\[Trust\\\]\\\(bad\\\)/);
  assert.match(safe.content, /https:\/\/example\.org\/a_\(b\)/);

  const unsafe = exportPapers([{ ...paper, sourceUrl: 'javascript:alert(1)' }], 'markdown');
  assert.doesNotMatch(unsafe.content, /javascript:|alert\(1\)/i);
});

test('conversation Markdown exports only the research content allowlist', () => {
  const result = exportConversation({
    id: '33333333-3333-4333-8333-333333333333',
    title: 'Trust / AI',
    ideaText: 'How does AI transparency affect political trust?',
    language: 'en',
    corpusSnapshot: { secret: 'do-not-export' },
    report: {
      ideaProfile: { summary: 'A trust study', topics: ['AI', 'trust'], population: 'voters', method: 'survey' },
      relatedPapers: [paper],
      innovationPaths: [{ title: 'Compare disclosures', rationale: 'Vary explanation detail.' }],
      recommendedNextSteps: ['Pre-register the contrast.'],
      limitations: ['Conference corpus only.'],
      hidden: 'internal report field',
    },
    messages: [{ content: { service_role: 'bad' } }],
  });
  assert.equal(result.filename, 'trust-ai.md');
  assert.match(result.content, /^# Trust \/ AI/m);
  assert.match(result.content, /## Research idea/);
  assert.match(result.content, /## Related papers/);
  assert.match(result.content, /Pre-register the contrast\./);
  assert.doesNotMatch(result.content, /33333333|do-not-export|service_role|internal report field/i);
});

test('browser download clicks a temporary link and always revokes the object URL', () => {
  const calls = [];
  const link = {
    click() { calls.push('click'); },
    remove() { calls.push('remove'); },
  };
  const documentRef = {
    body: { append(node) { assert.equal(node, link); calls.push('append'); } },
    createElement(tag) { assert.equal(tag, 'a'); return link; },
  };
  class FakeBlob {
    constructor(parts, options) { this.parts = parts; this.options = options; }
  }
  const urlApi = {
    createObjectURL(blob) { assert.ok(blob instanceof FakeBlob); calls.push('create'); return 'blob:test'; },
    revokeObjectURL(url) { assert.equal(url, 'blob:test'); calls.push('revoke'); },
  };
  downloadExport({ filename: 'papers.csv', mimeType: 'text/csv', content: 'title\nT' }, { documentRef, BlobCtor: FakeBlob, urlApi });
  assert.equal(link.download, 'papers.csv');
  assert.equal(link.href, 'blob:test');
  assert.deepEqual(calls, ['create', 'append', 'click', 'remove', 'revoke']);
});

test('application wires public-result, private-library, and conversation exports', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /exportPapers\(\[paper\], 'bibtex'\)/);
  assert.match(app, /exportPapers\(\[item\], 'bibtex'\)/);
  assert.match(app, /exportConversation\(session\)/);
  assert.match(app, /authState\.status !== 'authenticated'/);
  assert.doesNotMatch(app, /showUnavailableAction\('action\.exportUnavailable'\)/);
});
