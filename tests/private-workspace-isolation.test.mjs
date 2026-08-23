import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPrivateCacheGuard } from '../public/private-cache-guard.js';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

test('A private caches are invalidated before anonymous or B can use them', () => {
  const guard = createPrivateCacheGuard();
  guard.transition(USER_A);
  assert.equal(guard.mark('saved', USER_A), true);
  assert.equal(guard.mark('conversations', USER_A), true);
  assert.equal(guard.mark('report', USER_A), true);
  assert.equal(guard.owns('report', USER_A), true);

  const signedOut = guard.transition(null);
  assert.equal(signedOut.userChanged, true);
  assert.equal(signedOut.clearPrivateReport, true);
  assert.equal(guard.owns('saved', USER_A), false);
  assert.equal(guard.owns('conversations', USER_A), false);
  assert.equal(guard.owns('report', USER_A), false);

  guard.transition(USER_A);
  guard.mark('saved', USER_A);
  guard.mark('report', USER_A);
  const switched = guard.transition(USER_B);
  assert.equal(switched.userChanged, true);
  assert.equal(switched.clearPrivateReport, true);
  assert.equal(guard.owns('saved', USER_B), false);
  assert.equal(guard.owns('report', USER_B), false);
  assert.equal(guard.mark('saved', USER_A), false, 'late A responses cannot repopulate B cache');
});

test('anonymous live reports are not classified as private on auth transitions', () => {
  const guard = createPrivateCacheGuard();
  const signedIn = guard.transition(USER_A);
  assert.equal(signedIn.clearPrivateReport, false);
  const signedOut = guard.transition(null);
  assert.equal(signedOut.clearPrivateReport, false);
});

test('application clears private DOM and requires matching cache ownership before export', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /clearElement\(savedPapersRoot\)/);
  assert.match(app, /clearElement\(conversationsRoot\)/);
  assert.match(app, /clearElement\(reportRoot\)/);
  assert.match(app, /reportSection\.hidden = true/);
  assert.match(app, /ideaInput\.value = ''/);
  assert.match(app, /privateCacheGuard\.owns\('saved', authState\.user\.id\)/);
  assert.match(app, /privateCacheGuard\.owns\('conversations', authState\.user\.id\)/);
  assert.match(app, /privateCacheGuard\.mark\('report', ownerId\)/);
});
