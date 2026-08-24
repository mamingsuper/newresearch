import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('authenticated account center exposes identity, library, plan, export, and deletion controls', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

  for (const id of ['account-email', 'account-saved-papers', 'account-conversations', 'account-plan-name', 'account-upgrade', 'account-manage-billing', 'account-export', 'account-delete', 'account-status']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /account\.upgrade/);
  assert.match(script, /initBillingActions/);
  assert.match(script, /refreshAccountOverview/);
  assert.match(script, /requestAccountAction\('saved-papers'/);
  assert.match(script, /requestAccountAction\('conversations'/);
});
