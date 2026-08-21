import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeApsaPaper, normalizeIcaPaper } from '../src/ingestion/normalizers.mjs';

const retrievedAt = '2026-08-21T12:00:00.000Z';

test('normalizes an APSA record and preserves provenance', () => {
  const normalized = normalizeApsaPaper(
    {
      id: 'paper-42',
      title: '(Paper) Generative AI and Political Trust',
      abstract: 'We examine whether generative AI changes political trust.',
      authors: [{ name: 'Ada Scholar', affiliation: 'Example University' }],
      division: 'Political Communication',
      sessionTitle: 'AI and Democracy',
      sessionType: 'Panel',
      directUrl: 'https://apsa.example/paper-42',
    },
    { retrievedAt },
  );

  assert.equal(normalized.id, 'apsa-2026-paper-42');
  assert.equal(normalized.title, 'Generative AI and Political Trust');
  assert.deepEqual(normalized.authors, [
    { name: 'Ada Scholar', affiliation: 'Example University' },
  ]);
  assert.equal(normalized.sourceUrl, 'https://apsa.example/paper-42');
  assert.equal(normalized.retrievedAt, retrievedAt);
  assert.match(normalized.rawHash, /^[a-f0-9]{64}$/);
});

test('normalizes an ICA record without inventing an affiliation', () => {
  const normalized = normalizeIcaPaper(
    {
      id: 'ica-7',
      title: 'AI Literacy as a Boundary Condition',
      abstract: 'An online experiment tests AI literacy as a moderator.',
      authors: ['Y. Peng', { name: 'M. Chen', affiliation: '' }],
      division: 'Human-Machine Communication',
      session_type: 'Paper Session',
      session_title: 'Human-AI Relations',
      url: 'https://ica.example/papers/ica-7',
      keywords: ['AI literacy', 'experiment'],
    },
    { retrievedAt },
  );

  assert.equal(normalized.id, 'ica-2026-ica-7');
  assert.deepEqual(normalized.authors, [
    { name: 'Y. Peng', affiliation: null },
    { name: 'M. Chen', affiliation: null },
  ]);
  assert.deepEqual(normalized.keywords, ['AI literacy', 'experiment']);
  assert.equal(normalized.sessionType, 'Paper Session');
});

test('rejects a source record without an abstract', () => {
  assert.throws(
    () =>
      normalizeApsaPaper({
        id: 'missing-abstract',
        title: 'Incomplete record',
        abstract: '',
        authors: [],
        directUrl: 'https://apsa.example/missing',
      }),
    /abstract/i,
  );
});
