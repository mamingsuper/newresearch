import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const sourceRoot = new URL('../frontend/src/', import.meta.url);

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    if (entry.isDirectory() && entry.name === 'mocks') return '';
    const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
    return entry.isDirectory() ? sourceFiles(child) : /\.(ts|tsx)$/.test(entry.name) ? readFile(child, 'utf8') : '';
  }));
  return nested.flat(Infinity).join('\n');
}

test('production React workspace has no runtime mock imports and uses private Supabase contracts', async () => {
  const [appSources, papers, sessions, account, programs] = await Promise.all([
    sourceFiles(sourceRoot),
    readFile(new URL('adapters/papers.ts', sourceRoot), 'utf8'),
    readFile(new URL('adapters/sessions.ts', sourceRoot), 'utf8'),
    readFile(new URL('adapters/account.ts', sourceRoot), 'utf8'),
    readFile(new URL('adapters/programs.ts', sourceRoot), 'utf8'),
  ]);

  assert.doesNotMatch(appSources, /from\s+["']\.\.\/mocks\//);
  assert.doesNotMatch(appSources, /MOCK_[A-Z_]+/);
  assert.match(papers, /saved_papers/);
  assert.match(papers, /get_my_saved_papers/);
  assert.match(sessions, /analysis_sessions/);
  assert.match(sessions, /save-analysis/);
  assert.match(account, /export-account/);
  assert.match(account, /delete-account/);
  assert.match(programs, /submit-program/);
  assert.match(programs, /program-submissions/);
});

test('private pages explicitly explain signed-out saved-paper and conversation states', async () => {
  const [saved, conversations] = await Promise.all([
    readFile(new URL('pages/SavedPapers.tsx', sourceRoot), 'utf8'),
    readFile(new URL('pages/Conversations.tsx', sourceRoot), 'utf8'),
  ]);
  assert.match(saved, /Sign in|登录/);
  assert.match(saved, /saved|收藏/i);
  assert.match(conversations, /Sign in|登录/);
  assert.match(conversations, /history|历史|conversation/i);
});
