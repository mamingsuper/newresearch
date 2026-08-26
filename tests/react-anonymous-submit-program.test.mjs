import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('conference URL submission remains available without login while file upload is an account feature', async () => {
  const [page, adapter] = await Promise.all([
    readFile(new URL('../frontend/src/pages/SubmitProgram.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../frontend/src/adapters/programs.ts', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(page, /if \(!user\) return/);
  assert.doesNotMatch(page, /contact-email|contactEmail|type="email"/);
  assert.match(page, /programUrl/);
  assert.match(page, /Sign in to upload|登录后可上传/);
  assert.match(adapter, /publicEdgeFetch\("submit-program"/);
  assert.doesNotMatch(adapter, /contactEmail/);
});
