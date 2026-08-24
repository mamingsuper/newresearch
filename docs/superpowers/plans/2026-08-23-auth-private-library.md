# Auth and Private Research Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add passwordless Supabase Auth, private paper favorites, explicit saved analysis conversations, and safe CSV/BibTeX/Markdown exports without restricting anonymous analysis.

**Architecture:** Load a pinned local copy of the Supabase browser SDK generated from the npm package, never a runtime CDN. Use the publishable key in generated public config, RLS for owner CRUD, and narrowly scoped Edge Functions when canonical server data or strict report validation is required. UI modules receive a client interface so unit tests use fakes and never contact production.

**Tech Stack:** Supabase Auth/Postgres/Edge Functions, `@supabase/supabase-js` 2.112.3, Vanilla JavaScript, Node test runner

**Spec:** `docs/superpowers/specs/2026-08-23-product-workspace-expansion-design.md`

## Global Constraints

- Anonymous analysis remains functional when Auth configuration is absent.
- Analysis persistence is opt-in only; no database write occurs before **Save to workspace**.
- Use only the Supabase publishable key in the browser. Secret/service-role keys remain server-side.
- RLS policies explicitly require `auth.uid() is not null` and ownership.
- Authorization roles use `app_metadata`, never user-editable metadata.
- The public build contains no OpenAI, HMAC, Supabase secret, or service-role key.
- Pin `@supabase/supabase-js` to exactly `2.112.3`.

---

### Task 1: Self-host the pinned Supabase browser SDK and generate public config

**Files:**
- Modify: `package.json`
- Create: `scripts/prepare-browser-vendor.mjs`
- Create: `public/config.template.js`
- Modify: `public/config.js`
- Modify: `scripts/build-pages.mjs`
- Modify: `scripts/build.mjs`
- Modify: `public/index.html`
- Modify: `.gitignore`
- Create: `tests/browser-sdk-build.test.mjs`
- Modify: `.github/workflows/pages.yml`

**Interfaces:**
- Produces: `public/vendor/supabase-2.112.3.js` from the installed npm package
- Produces: `window.__IDEA_RADAR_CONFIG__ = { apiBaseUrl, supabaseUrl, supabasePublishableKey }`
- Consumes: `PUBLIC_SUPABASE_PUBLISHABLE_KEY`; this value is intentionally public and is configured as a GitHub Actions repository variable, not a secret

- [ ] **Step 1: Write the failing build contract**

```js
test('browser SDK is pinned, local, and generated before public builds', async () => {
  const pkg = JSON.parse(await text('package.json'));
  assert.equal(pkg.dependencies['@supabase/supabase-js'], '2.112.3');
  assert.equal(pkg.scripts['browser:vendor'], 'node scripts/prepare-browser-vendor.mjs');
  const html = await text('public/index.html');
  assert.match(html, /\.\/vendor\/supabase-2\.112\.3\.js/);
  assert.doesNotMatch(html, /cdn\.jsdelivr|unpkg|esm\.sh/);
});

test('public config generation accepts publishable keys but rejects secrets', async () => {
  const builder = await text('scripts/build-pages.mjs');
  assert.match(builder, /PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(builder, /sb_publishable_/);
  assert.match(builder, /sb_secret_|service_role|OPENAI_API_KEY/i);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/browser-sdk-build.test.mjs`

Expected: FAIL because the dependency, vendor script, and generated config do not exist.

- [ ] **Step 3: Add the exact dependency and vendor preparation script**

Add `"@supabase/supabase-js": "2.112.3"`. `prepare-browser-vendor.mjs` resolves the package, copies `dist/umd/supabase.js` to `public/vendor/supabase-2.112.3.js`, and fails if the package version differs. Add `public/vendor/` to `.gitignore`.

Add `browser:vendor` before `dev`, `test`, `build`, and `pages:build`; keep CI `npm install --ignore-scripts` safe because explicit npm scripts prepare the asset.

- [ ] **Step 4: Generate config from a template**

```js
window.__IDEA_RADAR_CONFIG__ = Object.freeze({
  apiBaseUrl: 'https://euptkcjwunpnwiqejtru.supabase.co/functions/v1',
  supabaseUrl: 'https://euptkcjwunpnwiqejtru.supabase.co',
  supabasePublishableKey: '__PUBLIC_SUPABASE_PUBLISHABLE_KEY__',
});
```

`build-pages.mjs` replaces only the exact token. It accepts keys beginning `sb_publishable_`, rejects missing or other values for the production Pages build, and keeps the existing secret scan. The checked-in `public/config.js` contains the same URL fields with an empty `supabasePublishableKey`; local development therefore disables Auth while preserving anonymous analysis until a local generated config is supplied.

- [ ] **Step 5: Configure workflow variable consumption**

```yaml
- run: npm run pages:build
  env:
    PUBLIC_SUPABASE_PUBLISHABLE_KEY: ${{ vars.SUPABASE_PUBLISHABLE_KEY }}
```

- [ ] **Step 6: Run tests and commit**

Run: `npm install --ignore-scripts && node --test tests/browser-sdk-build.test.mjs tests/pages-deployment.test.mjs`

Expected: PASS and `public/vendor/supabase-2.112.3.js` is ignored by git.

```bash
git add package.json package-lock.json scripts/prepare-browser-vendor.mjs public/config.template.js public/config.js scripts/build-pages.mjs scripts/build.mjs public/index.html .gitignore tests/browser-sdk-build.test.mjs .github/workflows/pages.yml
git commit -m "build: self-host pinned Supabase browser client"
```

### Task 2: Add user workspace schema and strict RLS

**Files:**
- Create: `supabase/migrations/202608230004_user_workspace.sql`
- Create: `tests/user-workspace-migration.test.mjs`

**Interfaces:**
- Produces: `profiles`, `saved_papers`, `analysis_sessions`, `analysis_messages`
- Produces: owner-only RLS policies and `updated_at` triggers
- Produces: authenticated `get_my_saved_papers()` and service-role-only `save_analysis_session(...)` public invoker RPCs backed by `workspace_private` definer helpers
- Consumes: `auth.users(id)` and `public.papers(id)`

- [ ] **Step 1: Write failing migration assertions**

```js
test('workspace migration creates constrained user-owned tables and RLS', async () => {
  const sql = await text('supabase/migrations/202608230004_user_workspace.sql');
  for (const table of ['profiles', 'saved_papers', 'analysis_sessions', 'analysis_messages']) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, 'i'));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.match(sql, /primary key\s*\(user_id,\s*paper_id\)/i);
  assert.match(sql, /\(select auth\.uid\(\)\) is not null[\s\S]*\(select auth\.uid\(\)\) = user_id/i);
  assert.match(sql, /idea_text[\s\S]*char_length\(idea_text\) between 20 and 5000/i);
  assert.match(sql, /client_request_id uuid not null/i);
  assert.match(sql, /unique\s*\(user_id,\s*client_request_id\)/i);
  assert.match(sql, /sequence_no smallint not null/i);
  assert.match(sql, /unique\s*\(session_id,\s*sequence_no\)/i);
  assert.match(sql, /grant update \(title\) on table public\.analysis_sessions to authenticated/i);
  assert.doesNotMatch(sql, /grant[^;]*insert[^;]*public\.analysis_sessions[^;]*authenticated/i);
  assert.match(sql, /grant execute on function public\.save_analysis_session\([^;]*to service_role/i);
  assert.doesNotMatch(sql, /grant execute on function public\.save_analysis_session\([^;]*to authenticated/i);
  assert.match(sql, /get_my_saved_papers/i);
  assert.match(sql, /save_analysis_session/i);
  assert.doesNotMatch(sql, /grant[^;]+\bto anon\b/i);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/user-workspace-migration.test.mjs`

Expected: FAIL with missing migration.

- [ ] **Step 3: Implement schema, indexes, triggers, and policies**

Create exact tables from the spec. Add indexes on `saved_papers(user_id, created_at desc)`, `analysis_sessions(user_id, updated_at desc)`, and `analysis_messages(session_id, created_at)`. Add a required `client_request_id uuid` with a unique `(user_id, client_request_id)` constraint for save idempotency. Add a positive `sequence_no` with a unique `(session_id, sequence_no)` constraint for deterministic message order. Bound notes to 4,000 characters, tags to 20 entries of 64 characters, titles to 200 characters, and message JSON serialized size to 64 KiB.

Put every workspace helper in the dedicated, non-exposed `workspace_private` schema, revoke default function execution, and grant only the exact schema/function privileges required by each wrapper. Profile creation uses a `security definer` trigger owned by `postgres`, sets an empty `search_path`, and copies only a bounded display name and validated preferred language. Revoke trigger-function execution from public roles.

Every browser policy uses `to authenticated` plus `auth.uid() is not null`. Profiles remain owner-select/update and saved papers remain owner CRUD. Authenticated clients may only select/delete their own sessions and update the `title` column; they cannot insert sessions or update idea/report/corpus evidence. Messages are owner-select only, with access verifying both `analysis_messages.user_id` and ownership of the parent session. Authenticated clients receive no message insert/update/delete path.

`get_my_saved_papers()` is a public `security invoker` wrapper over a `workspace_private security definer` helper with an empty `search_path`. The helper derives the owner from `auth.uid()` and returns only saved-paper note/tags plus canonical title, authors, abstract, conference, division, keywords, and source URL. Grant this read RPC only to `authenticated`.

`save_analysis_session(target_user_id, client_request_id, title, idea_text, report, language, corpus_snapshot)` is a public `security invoker` wrapper over a `workspace_private security definer` helper. Grant both layers only to `service_role`; explicitly revoke `anon` and `authenticated`. The already-authenticated Edge boundary supplies the verified user ID and stable request UUID. The helper validates the target user and table constraints, inserts the session plus sequence 1 user/sequence 2 assistant messages atomically, and returns the session ID. Repeating `(target_user_id, client_request_id)` returns the existing session without duplicate messages.

- [ ] **Step 4: Run migration tests and existing advisor-contract tests**

Run: `node --test tests/user-workspace-migration.test.mjs tests/live-hardening-migration.test.mjs tests/corpus-foundation-migration.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202608230004_user_workspace.sql tests/user-workspace-migration.test.mjs
git commit -m "feat: add private user workspace schema"
```

### Task 3: Implement Auth client, sign-in dialog, and intent restoration

**Files:**
- Create: `public/auth-client.js`
- Create: `public/auth-ui.js`
- Create: `tests/auth-client.test.mjs`
- Modify: `public/app.js`
- Modify: `public/index.html`
- Modify: `public/styles.css`

**Interfaces:**
- Produces: `createAuthClient({ sdk, url, publishableKey, storage })`
- Produces: `initAuthUi({ authClient, dialog, onSessionChange, consumeIntent })`
- Produces session states: `{ status: 'disabled'|'anonymous'|'authenticated'|'loading', user: null|{ id, email } }`

- [ ] **Step 1: Write failing client tests with a fake SDK**

```js
test('Auth disables cleanly without public configuration', () => {
  assert.equal(createAuthClient({ sdk: null, url: '', publishableKey: '' }).enabled, false);
});

test('email OTP uses the Pages URL and remembers only the pending intent', async () => {
  const calls = [];
  const client = createAuthClient({ sdk: fakeSdk(calls), url: 'https://p.supabase.co', publishableKey: 'sb_publishable_test', storage: memoryStorage() });
  await client.signInWithEmail('reader@example.org', { redirectTo: 'https://mamingsuper.github.io/newresearch/' });
  assert.equal(calls[0].method, 'signInWithOtp');
  assert.equal(calls[0].options.emailRedirectTo, 'https://mamingsuper.github.io/newresearch/');
  assert.equal(calls.some((call) => JSON.stringify(call).includes('research idea')), false);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/auth-client.test.mjs`

Expected: FAIL with missing modules.

- [ ] **Step 3: Implement Auth wrapper**

Use `window.supabase.createClient(url, publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })`. Expose email OTP, Google/GitHub OAuth, sign out, `getSession`, and `onAuthStateChange`. Validate email length/shape before SDK calls.

Store only `{ action, entityId, returnHash, createdAt }` under `idea-radar-auth-intent`; reject intents older than 15 minutes. Never store idea or report content in this key.

- [ ] **Step 4: Implement accessible sign-in UI**

Use a native `<dialog id="auth-dialog">` with email field, OTP submit, Google/GitHub buttons, status region, Cancel, and focus restoration. If providers are not enabled, display the provider error safely and keep email OTP available.

- [ ] **Step 5: Wire account-aware buttons**

Anonymous save/history/account actions set a pending intent and open the dialog. After an authenticated state arrives, consume the intent exactly once and return focus to the originating paper/action.

- [ ] **Step 6: Test and commit**

Run: `node --test tests/auth-client.test.mjs tests/readable-workspace.test.mjs tests/static-ui.test.mjs`

Expected: PASS.

```bash
git add public/auth-client.js public/auth-ui.js public/app.js public/index.html public/styles.css tests/auth-client.test.mjs
git commit -m "feat: add passwordless workspace authentication"
```

### Task 4: Implement favorites and the saved-paper library

**Files:**
- Create: `public/saved-papers.js`
- Create: `tests/saved-papers.test.mjs`
- Modify: `public/app.js`
- Modify: `public/index.html`
- Modify: `public/styles.css`

**Interfaces:**
- Produces: `createSavedPaperStore({ supabase, getUserId })`
- Methods: `list()` via `get_my_saved_papers`, `save(paperId)`, `remove(paperId)`, `updateNote(paperId, { note, tags })`
- Produces: `renderSavedPaperLibrary({ root, items, onRemove, onExport })`

- [ ] **Step 1: Write failing idempotency and ownership-client tests**

```js
test('save uses upsert on the owner-paper key and never accepts a caller user id', async () => {
  const fake = postgrestFake();
  const store = createSavedPaperStore({ supabase: fake.client, getUserId: () => 'user-1' });
  await store.save('paper-1');
  assert.deepEqual(fake.lastUpsert, { user_id: 'user-1', paper_id: 'paper-1' });
  assert.equal(fake.lastConflict, 'user_id,paper_id');
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/saved-papers.test.mjs`

Expected: FAIL with missing module.

- [ ] **Step 3: Implement store and optimistic UI rollback**

All mutations derive `user_id` from the authenticated session. The UI immediately updates the icon, disables repeat clicks, and restores the prior state with an `aria-live` error when the request fails.

- [ ] **Step 4: Implement library view**

Call `get_my_saved_papers()` to receive allowlisted canonical paper fields, render title/citation/conference/abstract/source/private note/tags, support local filtering, and show an explicit empty state. Do not clone paper metadata into `saved_papers` and do not add a broad authenticated `select` policy to `public.papers`.

- [ ] **Step 5: Test and commit**

Run: `node --test tests/saved-papers.test.mjs tests/static-ui.test.mjs`

Expected: PASS.

```bash
git add public/saved-papers.js public/app.js public/index.html public/styles.css tests/saved-papers.test.mjs
git commit -m "feat: add private saved paper library"
```

### Task 5: Add explicit saved analyses and conversations

**Files:**
- Create: `supabase/functions/save-analysis/index.ts`
- Create: `supabase/functions/_shared/authenticated-request.ts`
- Create: `public/conversations.js`
- Create: `tests/save-analysis-contract.test.mjs`
- Create: `tests/conversations.test.mjs`
- Modify: `public/app.js`
- Modify: `public/index.html`

**Interfaces:**
- Endpoint: `POST /functions/v1/save-analysis` with bearer JWT and `{ clientRequestId, title, ideaText, report, language, corpusSnapshot }`; `clientRequestId` is a UUID and no body user ID is accepted
- Response: `{ data: { sessionId, createdAt } }`
- Produces: `createConversationStore({ fetchImpl, endpoint, getAccessToken, randomUUID })`, which creates one request UUID per explicit save intent and reuses it for retries

- [ ] **Step 1: Write failing privacy and contract tests**

```js
test('analysis rendering never persists until save is invoked', async () => {
  const script = await text('public/app.js');
  assert.doesNotMatch(script, /renderReport[\s\S]*save-analysis/);
  assert.match(script, /Save to workspace/);
});

test('save endpoint requires Auth and validates the canonical report', async () => {
  const edge = await text('supabase/functions/save-analysis/index.ts');
  assert.match(edge, /authorization/i);
  assert.match(edge, /clientRequestId[\s\S]*uuid/i);
  assert.match(edge, /getUser/i);
  assert.match(edge, /ideaText[\s\S]*5000/);
  assert.match(edge, /relatedPapers/);
  assert.match(edge, /target_user_id[\s\S]*user\.id/i);
  assert.doesNotMatch(edge, /body\.(?:userId|user_id)/i);
  assert.match(edge, /cache-control['"]?,\s*['"]no-store/i);
});

test('conversation save retries reuse one client request UUID', async () => {
  const store = createConversationStore({
    fetchImpl: retryingFetch,
    endpoint: '/functions/v1/save-analysis',
    getAccessToken: async () => 'user-jwt',
    randomUUID: () => '11111111-1111-4111-8111-111111111111',
  });
  await store.save(reportInput);
  assert.deepEqual(seenBodies.map((body) => body.clientRequestId), [
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111',
  ]);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/save-analysis-contract.test.mjs tests/conversations.test.mjs`

Expected: FAIL with missing files.

- [ ] **Step 3: Implement authenticated request verification**

Validate the bearer token with a user-scoped Supabase Auth client, derive canonical `user.id` server-side, reject missing/expired sessions, cap the body at 256 KiB, and never log idea/report content. Do not accept `userId` or `user_id` from the request body. Keep the server-only Supabase secret/service client separate and initialize it only for the validated persistence call.

- [ ] **Step 4: Validate and persist the session atomically**

Validate the same idea length and canonical report structure used by `analyze-idea`, require a UUID `clientRequestId`, and allowlist the corpus snapshot. After bearer verification and canonical validation, invoke the service-role-only `save_analysis_session(...)` using the server-only Supabase secret/service client with `target_user_id = verified user.id` and `client_request_id = clientRequestId`. Never pass a body-derived user ID. Return only the session ID and time; a retry with the same verified user and request UUID returns the original idempotent result.

- [ ] **Step 5: Implement explicit Save and conversation list**

The Save button appears only after a successful report. It is never called by `renderReport`. `createConversationStore` generates one UUID when an explicit save intent begins, retains it while that intent is pending or retryable, and reuses it for every retry; a new explicit save intent receives a new UUID. On success the button changes to **Saved**, then the Conversations view can list, rename, reopen, export, and delete the owner's sessions.

- [ ] **Step 6: Test and commit**

Run: `node --test tests/save-analysis-contract.test.mjs tests/conversations.test.mjs tests/edge-function-contract.test.mjs`

Expected: PASS.

```bash
git add supabase/functions/save-analysis/index.ts supabase/functions/_shared/authenticated-request.ts public/conversations.js public/app.js public/index.html tests/save-analysis-contract.test.mjs tests/conversations.test.mjs
git commit -m "feat: add opt-in saved analysis conversations"
```

### Task 6: Add safe CSV, BibTeX, and Markdown exports

**Files:**
- Create: `public/exports.js`
- Create: `tests/exports.test.mjs`
- Modify: `public/saved-papers.js`
- Modify: `public/conversations.js`
- Modify: `public/app.js`

**Interfaces:**
- Produces: `exportPapers(papers, 'csv'|'bibtex'|'markdown') -> { filename, mimeType, content }`
- Produces: `exportConversation(session) -> { filename, mimeType: 'text/markdown', content }`

- [ ] **Step 1: Write failing escaping tests**

```js
test('CSV quotes commas, quotes, and formula-leading cells', () => {
  const result = exportPapers([{ title: '=HYPERLINK("x")', abstract: 'a,"b"', authors: [{ name: 'Doe, Jane' }] }], 'csv');
  assert.match(result.content, /^title,/);
  assert.match(result.content, /"'=HYPERLINK\(""x""\)"/);
  assert.match(result.content, /"a,""b"""/);
});

test('exports omit internal identifiers, vectors, and secrets', () => {
  const paper = { paperId: 'uuid', title: 'T', abstract: 'A', embedding: [1], service_role: 'bad' };
  for (const format of ['csv', 'bibtex', 'markdown']) {
    const content = exportPapers([paper], format).content;
    assert.doesNotMatch(content, /embedding|service_role|uuid/i);
  }
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/exports.test.mjs`

Expected: FAIL with missing module.

- [ ] **Step 3: Implement pure exporters**

Use an allowlist of canonical fields. Prefix spreadsheet cells beginning `=`, `+`, `-`, or `@` with an apostrophe. Generate stable BibTeX keys from first-author/year/title with collision suffixes. Markdown includes citation, abstract, conference, and source link.

- [ ] **Step 4: Wire browser downloads**

Create a Blob and temporary object URL only after explicit user action, revoke it immediately after click, and show the exported record count. Exporting current analysis results does not require persistence or sign-in; exporting the private library requires the active session.

- [ ] **Step 5: Test and commit**

Run: `node --test tests/exports.test.mjs tests/saved-papers.test.mjs tests/conversations.test.mjs`

Expected: PASS.

```bash
git add public/exports.js public/saved-papers.js public/conversations.js public/app.js tests/exports.test.mjs
git commit -m "feat: export papers and saved analyses safely"
```

### Task 7: Configure and verify Auth in the live project

**Files:**
- Create: `docs/operations/auth-and-private-library.md`
- Modify: `README.md`

**Interfaces:**
- External configuration: Supabase Site URL and redirects, email OTP, optional Google/GitHub providers, GitHub repository variable `SUPABASE_PUBLISHABLE_KEY`

- [ ] **Step 1: Run all local gates**

Run: `npm test && npm run check && npm run build && PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test npm run pages:build`

Expected: all commands PASS; the test key is present only in the temporary Pages artifact and no secret-shaped value appears.

- [ ] **Step 2: Apply the migration and deploy `save-analysis`**

Use the existing Supabase deployment workflow. Verify Advisor has no Critical/Warning findings caused by the new tables and that anonymous roles have no user-table access.

- [ ] **Step 3: Configure Auth URLs and public key**

Set Site URL to `https://mamingsuper.github.io/newresearch/` and allow the same URL plus the local development origin. Enable email OTP. Configure Google/GitHub only after their redirect URIs are registered. Add the project's `sb_publishable_…` key as the GitHub Actions repository variable `SUPABASE_PUBLISHABLE_KEY`.

- [ ] **Step 4: Perform two-user live isolation smoke tests**

With two test accounts:

- user A saves a paper and analysis;
- user B cannot query, update, or delete A's rows;
- A can reopen and delete the analysis;
- anonymous analysis still succeeds;
- an unsaved analysis creates no user rows;
- current results export without sign-in;
- private library exports only after sign-in.

Record exact non-sensitive results and cleanup steps in `docs/operations/auth-and-private-library.md`.

- [ ] **Step 5: Commit operations documentation**

```bash
git add docs/operations/auth-and-private-library.md README.md
git commit -m "docs: operate authenticated research workspace"
```
