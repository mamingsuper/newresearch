import test from 'node:test';
import assert from 'node:assert/strict';
import { plainText, toSnapshotRecord } from '../scripts/fetch-oxford-abstracts.mjs';

test('converts public Oxford Abstracts submission data without retaining HTML', () => {
  const record = toSnapshotRecord({
    serial_number: 594,
    authors: [{
      first_name: 'Giulia', middle_initial: '', last_name: 'Fornaro',
      affiliations: [{ institution: 'Bocconi University', city: '', state: '', country: 'Italy' }],
    }],
    responses: [
      { value: '<b>Fallback title</b>', question: { is_title: true, is_category: false, question_name: 'Title' } },
      { value: '<p>A sufficiently detailed public abstract about policy design.</p>', without_html: 'A sufficiently detailed public abstract about policy design.', question: { is_title: false, is_category: false, question_name: 'Abstract' } },
      { value: 'Gender and Sexuality Politics', question: { is_title: false, is_category: true, question_name: 'Section' } },
    ],
    program_sessions_submissions: [{ program_session: { name: 'GD02: Reproduction and Family Gender Norms', program_type: { name: 'Panel' } } }],
  }, new Map([['594', 'Abortion Policy Design &amp; Target Populations']]), 75765);

  assert.equal(record.title, 'Abortion Policy Design & Target Populations');
  assert.equal(record.authors[0].name, 'Giulia Fornaro');
  assert.equal(record.authors[0].affiliation, 'Bocconi University, Italy');
  assert.equal(record.division, 'Gender and Sexuality Politics');
  assert.equal(record.sessionType, 'Panel');
  assert.equal(record.directUrl, 'https://virtual.oxfordabstracts.com/event/75765/submission/594');
  assert.doesNotMatch(record.abstract, /<[^>]+>/);
});

test('plainText normalizes HTML and numeric entities', () => {
  assert.equal(plainText('<p>AI&nbsp;&amp; politics &#8211; evidence</p>'), 'AI & politics – evidence');
});
