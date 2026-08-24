import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConferenceCard, loadConferencePrograms } from '../public/conference-library.js';
import { createAdminSubmissionController } from '../public/admin-submissions.js';

test('conference cards expose only reviewed HTTPS provenance', () => {
  const card = buildConferenceCard({ name: 'ICA', year: 2027, programUrl: 'https://official.example/program', coverageStatus: 'program_only' });
  assert.equal(card.link.href, 'https://official.example/program');
  assert.equal(card.link.rel, 'noopener noreferrer');
  assert.match(card.status, /program only/i);
  assert.equal(buildConferenceCard({ programUrl: 'javascript:alert(1)' }).link, null);
});

test('public catalog reads only the published conference view', async () => {
  const calls = [];
  const query = { select(v) { calls.push(v); return this; }, eq() { return this; }, order() { return this; }, then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); } };
  await loadConferencePrograms({ supabase: { from(table) { assert.equal(table, 'conference_programs'); return query; } } });
  assert.doesNotMatch(calls[0], /user_id|reviewed_by|storage_path/i);
});

test('admin controller fails closed for non-admin and sends fresh bearer review', async () => {
  let called = 0;
  const denied = createAdminSubmissionController({ isAdmin: () => false });
  await assert.rejects(() => denied.list(), { code: 'admin_required' });
  const controller = createAdminSubmissionController({
    isAdmin: () => true,
    getAccessToken: async () => 'jwt',
    supabase: { from() { return { select() { return this; }, order() { return Promise.resolve({ data: [], error: null }); } }; } },
    api: { async review(body, options) { called += 1; assert.equal(options.accessToken, 'jwt'); return body; } },
  });
  await controller.review({ submissionId: '11111111-1111-4111-8111-111111111111', expectedStatus: 'submitted', decision: 'start_review' });
  assert.equal(called, 1);
});
