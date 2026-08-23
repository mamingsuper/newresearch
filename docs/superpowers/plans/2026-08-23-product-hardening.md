# Product Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Idea Radar as an operable public product with account portability/deletion, complete bilingual and accessibility coverage, privacy-safe operational diagnostics, modern CI actions, and requirement-by-requirement live verification.

**Architecture:** Extend the additive Supabase model with account lifecycle RPCs and coarse private operational events. Keep telemetry first-party and content-free. Drive accessibility, localization, performance, and deployment quality through executable contracts plus rendered QA. Finish with a completion matrix that maps every approved requirement to authoritative evidence.

**Tech Stack:** Supabase Auth/Postgres/Edge Functions, Vanilla JavaScript, Node test runner, GitHub Actions/Pages

**Spec:** `docs/superpowers/specs/2026-08-23-product-workspace-expansion-design.md`

## Global Constraints

- Account export must include the user's owned data and canonical saved-paper metadata without secrets, vectors, or other users' data.
- Account deletion requires a fresh authenticated session and explicit typed confirmation.
- Accepted conference provenance and content-free audit events survive contributor account deletion with the contributor ID anonymized.
- No third-party analytics, tracking pixels, session replay, or raw idea/message logging.
- English and Chinese must cover every production-visible state.
- The final completion claim requires automated, rendered, database, Auth, submission, ingestion, and live RAG evidence.

---

### Task 1: Add account data export and safe deletion

**Files:**
- Create: `supabase/migrations/202608230006_account_lifecycle.sql`
- Create: `supabase/functions/export-account/index.ts`
- Create: `supabase/functions/delete-account/index.ts`
- Create: `tests/account-lifecycle-migration.test.mjs`
- Create: `tests/account-lifecycle-functions.test.mjs`
- Create: `public/account.js`
- Create: `tests/account-ui.test.mjs`
- Modify: `public/index.html`
- Modify: `public/styles.css`

**Interfaces:**
- Endpoint: `GET /functions/v1/export-account`
- Response: JSON attachment `{ exportedAt, profile, savedPapers, analysisSessions, submissions }`
- Endpoint: `POST /functions/v1/delete-account` with `{ confirmation: 'DELETE MY ACCOUNT' }`
- Response: HTTP 204 after database cleanup/anonymization and Auth deletion

- [ ] **Step 1: Write failing lifecycle tests**

```js
test('account migration preserves accepted provenance while anonymizing deleted contributors', async () => {
  const sql = await text('supabase/migrations/202608230006_account_lifecycle.sql');
  assert.match(sql, /program_submissions[\s\S]*user_id[\s\S]*on delete set null/i);
  assert.match(sql, /submission_events[\s\S]*actor_user_id[\s\S]*on delete set null/i);
  assert.match(sql, /delete_user_workspace/i);
});

test('delete endpoint requires fresh Auth and exact typed confirmation', async () => {
  const source = await text('supabase/functions/delete-account/index.ts');
  assert.match(source, /DELETE MY ACCOUNT/);
  assert.match(source, /sessionIssuedAt|iat/i);
  assert.match(source, /600/);
  assert.match(source, /auth[\s\S]*admin[\s\S]*deleteUser/i);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/account-lifecycle-migration.test.mjs tests/account-lifecycle-functions.test.mjs tests/account-ui.test.mjs`

Expected: FAIL with missing files.

- [ ] **Step 3: Implement database lifecycle transaction**

`delete_user_workspace(target_user_id)` deletes favorites, messages, sessions, and profile; nulls contributor/actor IDs in submissions/events that must remain; deletes non-submitted orphan uploads through a returned cleanup list; and does not delete published conference programs or imported papers. Restrict execution to service role and revoke all public access.

- [ ] **Step 4: Implement account export**

Verify the bearer token, derive the user ID, query only owner rows, join saved paper IDs to an allowlist of canonical paper fields, and stream a JSON attachment with `cache-control: no-store` and `content-disposition: attachment`. Omit access tokens, emails of other users, event internals, vectors, embedding jobs, and secrets.

- [ ] **Step 5: Implement account deletion**

Require a token `iat` no older than 600 seconds, exact confirmation, and a second confirmation in the UI. Run the database transaction, remove returned orphan Storage paths, delete the Auth user with server credentials, clear the browser session, and return 204. If Auth deletion fails, retain a private retry record without raw content and show a support-safe request ID.

- [ ] **Step 6: Implement account UI and tests**

Provide profile language/display-name controls, Download my data, Delete account, and Sign out. The destructive button is separated visually, requires reauthentication when stale, and never activates on Enter from another field.

Run: `node --test tests/account-lifecycle-migration.test.mjs tests/account-lifecycle-functions.test.mjs tests/account-ui.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/202608230006_account_lifecycle.sql supabase/functions/export-account/index.ts supabase/functions/delete-account/index.ts tests/account-lifecycle-migration.test.mjs tests/account-lifecycle-functions.test.mjs public/account.js tests/account-ui.test.mjs public/index.html public/styles.css
git commit -m "feat: add account portability and deletion"
```

### Task 2: Complete bilingual, keyboard, zoom, and reduced-motion behavior

**Files:**
- Modify: `public/i18n.js`
- Modify: `public/workspace.js`
- Modify: `public/auth-ui.js`
- Modify: `public/program-submission.js`
- Modify: `public/admin-submissions.js`
- Modify: `public/account.js`
- Modify: `public/styles.css`
- Modify: `public/results-v2.css`
- Create: `tests/accessibility-i18n.test.mjs`

**Interfaces:**
- Produces complete key parity between `en` and `zh`
- Produces predictable focus transitions for Auth, analysis results, saves, submissions, reviews, exports, and deletion

- [ ] **Step 1: Write failing key-parity and accessibility tests**

```js
test('English and Chinese dictionaries have identical production keys', () => {
  const { en, zh } = dictionariesForTest();
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
});

test('production controls expose names and no essential hover-only content', async () => {
  const html = await text('public/index.html');
  assert.doesNotMatch(html, /<button(?![^>]*(?:aria-label|>\s*[^<]))/i);
  const css = `${await text('public/styles.css')}\n${await text('public/results-v2.css')}`;
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /:focus-visible/);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/accessibility-i18n.test.mjs tests/i18n.test.mjs`

Expected: FAIL for missing keys and product-state coverage.

- [ ] **Step 3: Complete copy and language persistence**

Translate navigation, form, progress, report, Auth, favorites, conversations, exports, conference library, submission, admin, account, validation, empty, loading, success, and error states. Persist signed-in preference to `profiles` and anonymous preference to `idea-radar-locale`; server content remains canonical and is not machine-translated.

- [ ] **Step 4: Implement accessibility behavior**

Use native dialog semantics; trap focus only while dialogs are modal; return focus to origin; announce asynchronous success/failure through one polite live region and validation through assertive field errors. At 200% zoom no two-dimensional scrolling is required except intentionally wide data previews.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; }
}
:focus-visible { outline: 3px solid var(--blue); outline-offset: 3px; }
```

- [ ] **Step 5: Run tests and commit**

Run: `node --test tests/accessibility-i18n.test.mjs tests/i18n.test.mjs tests/static-ui.test.mjs`

Expected: PASS.

```bash
git add public/i18n.js public/workspace.js public/auth-ui.js public/program-submission.js public/admin-submissions.js public/account.js public/styles.css public/results-v2.css tests/accessibility-i18n.test.mjs
git commit -m "feat: complete bilingual accessible product states"
```

### Task 3: Add privacy-safe operational diagnostics and recovery contracts

**Files:**
- Modify: `supabase/migrations/202608230006_account_lifecycle.sql`
- Create: `supabase/functions/_shared/operational-events.ts`
- Create: `tests/operational-events.test.mjs`
- Modify: all new authenticated/submission Edge Functions
- Create: `public/recovery.js`
- Create: `tests/recovery.test.mjs`

**Interfaces:**
- Produces private table `operational_events(event_kind, outcome, duration_ms, count_value, request_id, created_at)`
- Produces `recordOperationalEvent(event)` with a closed allowlist
- Produces `withRecoverableAction({ key, action, onRetry })`

- [ ] **Step 1: Write failing privacy tests**

```js
test('operational events reject content and identity fields', () => {
  assert.throws(() => recordOperationalEvent({ eventKind: 'analysis', outcome: 'ok', idea: 'private' }), /unsupported field/i);
  assert.throws(() => recordOperationalEvent({ eventKind: 'submission', outcome: 'ok', email: 'a@example.org' }), /unsupported field/i);
});

test('recoverable actions deduplicate retries', async () => {
  let calls = 0;
  const run = withRecoverableAction({ key: 'save:session-1', action: async () => ++calls });
  await Promise.all([run(), run()]);
  assert.equal(calls, 1);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/operational-events.test.mjs tests/recovery.test.mjs`

Expected: FAIL with missing modules.

- [ ] **Step 3: Implement content-free diagnostics**

Allow only event kinds `auth`, `favorite`, `save_analysis`, `export`, `submission`, `review`, `preview`, `import`, `embedding`, outcomes `ok|rejected|failed`, bounded duration/count, and opaque request ID. Retain 30 days through a cleanup function. No user ID, IP, URL, filename, idea, title, abstract, message, token, or provider response is accepted.

- [ ] **Step 4: Implement reusable recovery behavior**

Deduplicate in-flight actions, expose Retry with the same idempotency key, preserve user input in memory, and never claim completion until the authoritative row/response is confirmed. Apply to favorite, save, export, upload, submit, review, preview, import, and embedding actions.

- [ ] **Step 5: Test and commit**

Run: `node --test tests/operational-events.test.mjs tests/recovery.test.mjs tests/http-app.test.mjs`

Expected: PASS.

```bash
git add supabase/migrations/202608230006_account_lifecycle.sql supabase/functions/_shared/operational-events.ts supabase/functions/save-analysis/index.ts supabase/functions/export-account/index.ts supabase/functions/delete-account/index.ts supabase/functions/submit-program/index.ts supabase/functions/review-program/index.ts supabase/functions/preview-program-import/index.ts supabase/functions/confirm-program-import/index.ts supabase/functions/process-embedding-jobs/index.ts public/recovery.js tests/operational-events.test.mjs tests/recovery.test.mjs
git commit -m "feat: harden private operations and recovery"
```

### Task 4: Modernize CI actions and enforce performance budgets

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/pages.yml`
- Create: `scripts/check-pages-budget.mjs`
- Create: `tests/pages-budget.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run pages:budget`
- Budget: initial JS ≤ 350 KiB gzip, combined CSS ≤ 90 KiB gzip, no runtime third-party script origins

- [ ] **Step 1: Write failing workflow/budget tests**

```js
test('workflows use Node 24-compatible action majors', async () => {
  for (const file of ['.github/workflows/ci.yml', '.github/workflows/pages.yml']) {
    const workflow = await text(file);
    assert.match(workflow, /actions\/checkout@v6/);
    assert.match(workflow, /actions\/setup-node@v6/);
    assert.doesNotMatch(workflow, /checkout@v4|setup-node@v4|configure-pages@v5/);
  }
  assert.match(await text('.github/workflows/pages.yml'), /actions\/configure-pages@v6/);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/pages-budget.test.mjs tests/pages-deployment.test.mjs`

Expected: FAIL on current v4/v5 action references and missing budget script.

- [ ] **Step 3: Update actions and preserve least privileges**

Use `actions/checkout@v6`, `actions/setup-node@v6` with `node-version: 22` and `package-manager-cache: false`, and `actions/configure-pages@v6`. Keep `contents: read`, `pages: write`, `id-token: write`; do not add repository write permissions.

- [ ] **Step 4: Implement deterministic budgets**

After `pages:build`, gzip JS/CSS in memory, report exact byte totals, fail above the budgets, and scan HTML for external script origins. Add `pages:budget` after `pages:build` in CI.

- [ ] **Step 5: Run and commit**

Run: `npm run pages:build && npm run pages:budget && node --test tests/pages-budget.test.mjs tests/pages-deployment.test.mjs`

Expected: PASS with reported totals.

```bash
git add .github/workflows/ci.yml .github/workflows/pages.yml scripts/check-pages-budget.mjs tests/pages-budget.test.mjs package.json
git commit -m "ci: modernize actions and enforce page budgets"
```

### Task 5: Execute the final completion audit and public rollout

**Files:**
- Create: `docs/qa/2026-08-23-product-completion-audit.md`
- Modify: `README.md`

**Interfaces:**
- Produces: requirement-to-evidence matrix for every approved acceptance criterion

- [ ] **Step 1: Run the complete automated gate**

Run: `npm test && npm run check && npm run build && PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test npm run pages:build && npm run pages:budget`

Expected: all commands exit 0 with no skipped product-contract test.

- [ ] **Step 2: Audit deployed database and authorization**

Verify migrations `202608230004`–`006` are applied, all user/submission tables have RLS, anonymous grants are limited to published conference reads, private tables are not exposed, Storage is private, Advisor has no new Critical/Warning, and two-user cross-access returns no rows/permission denied.

- [ ] **Step 3: Audit every explicit user journey**

Record authoritative evidence for:

- anonymous English and Chinese analysis against 8,906 ready papers;
- readable desktop/mobile/200%-zoom layout and keyboard navigation;
- email OTP sign-in and optional configured OAuth;
- save/unsave/note/tag paper;
- explicit save/reopen/rename/delete conversation;
- current-results and private-library CSV/BibTeX/Markdown export with abstracts;
- HTTPS link and private file program submission;
- non-admin review denial;
- admin reject/approve/preview/confirm;
- approval without confirmation leaves paper count unchanged;
- structured import queues and completes 512d embeddings;
- program-only PDF publishes provenance without changing paper count;
- account export and fresh-session deletion;
- no unsaved idea persistence and no secret exposure.

- [ ] **Step 4: Deploy and verify public Pages**

Deploy Edge Functions and Pages from the reviewed branch. Confirm GitHub Actions and Pages jobs succeed, the final URL loads without console errors, corpus status is ready, Auth callbacks return to the project subpath, and all public links use HTTPS.

- [ ] **Step 5: Write the completion matrix**

In `docs/qa/2026-08-23-product-completion-audit.md`, use columns: Requirement, Evidence source, Result, Remaining risk. A requirement is PASS only with direct test, database, rendered, workflow, or live-request evidence. Do not infer completion from code presence.

- [ ] **Step 6: Update README and commit**

Document user-facing capabilities, privacy defaults, supported submission formats, moderation, Auth, export formats, administrator operations, and current corpus scope.

```bash
git add docs/qa/2026-08-23-product-completion-audit.md README.md
git commit -m "docs: verify complete Idea Radar product expansion"
```
