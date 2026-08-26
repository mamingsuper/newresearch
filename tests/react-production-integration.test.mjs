import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const fromRoot = (path) => new URL(`../${path}`, import.meta.url);

test('approved React app is the production Pages frontend with real runtime adapters', async () => {
  const [rootPackage, frontendPackage, app, auth, billing, context, builder, workflow] = await Promise.all([
    readFile(fromRoot('package.json'), 'utf8'),
    readFile(fromRoot('frontend/package.json'), 'utf8'),
    readFile(fromRoot('frontend/src/App.tsx'), 'utf8'),
    readFile(fromRoot('frontend/src/adapters/auth.ts'), 'utf8'),
    readFile(fromRoot('frontend/src/adapters/billing.ts'), 'utf8'),
    readFile(fromRoot('frontend/src/context/AppContext.tsx'), 'utf8'),
    readFile(fromRoot('scripts/build-pages.mjs'), 'utf8'),
    readFile(fromRoot('.github/workflows/pages.yml'), 'utf8'),
  ]);

  assert.match(rootPackage, /frontend:build/);
  assert.match(frontendPackage, /@supabase\/supabase-js/);
  assert.match(app, /basename/);
  assert.match(auth, /supabase/);
  assert.match(auth, /onAuthStateChange|getSession/);
  assert.match(billing, /create-checkout-session/);
  assert.match(billing, /create-portal-session/);
  assert.match(billing, /checkout\.stripe\.com/);
  assert.match(billing, /billing\.stripe\.com/);
  assert.match(context, /billing\.status/);
  assert.doesNotMatch(context, /MockUser/);
  assert.match(builder, /frontend[\s\S]*dist/);
  assert.match(builder, /APODEX_API_KEY/);
  assert.match(workflow, /frontend/);
});
