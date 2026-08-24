# Moderated Conference Programs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let signed-in users submit conference program URLs or files, let administrators moderate them, publish reviewed program provenance, and import supported structured programs through a resumable validation and embedding pipeline.

**Architecture:** Store uploads in a private Supabase Storage bucket and submission metadata in RLS-protected tables. Edge Functions enforce authenticated submission and immutable admin transitions. Preview converts supported JSON/CSV (or ZIP containing one supported file) into canonical private staging rows; PDF and unsupported structured layouts can still publish as `program_only`. Final confirmation executes a PostgreSQL transaction that publishes the program, upserts validated papers, and queues embeddings. An admin-only batch Edge worker finishes embeddings resumably.

**Tech Stack:** Supabase Postgres/RLS/Storage/Edge Functions, Deno TypeScript, Vanilla JavaScript, OpenAI embeddings, Node test runner

**Spec:** `docs/superpowers/specs/2026-08-23-product-workspace-expansion-design.md`

## Global Constraints

- Only authenticated users submit programs; only `app_metadata.role = 'admin'` reviews or imports.
- Submission approval alone cannot modify `public.papers`.
- Accept URL submissions only with `https:` and no credentials.
- Uploads remain private until an administrator confirms hosting rights.
- Production imports require canonical title, authors, abstract, conference identity, and provenance.
- Every state transition is atomic and appended to `private.submission_events`.
- Structured preview supports JSON and CSV; ZIP may contain exactly one supported program file. PDF is catalogued as `program_only` unless a reviewed adapter is added.
- All import and embedding work is bounded, resumable, and idempotent.

---

### Task 1: Create submission, conference, staging, and job schema

**Files:**
- Create: `supabase/migrations/202608230005_conference_submissions.sql`
- Create: `tests/conference-submissions-migration.test.mjs`

**Interfaces:**
- Produces: `program_submissions`, `conference_programs`
- Produces private: `submission_events`, `program_import_previews`, `program_import_records`
- Produces Storage bucket `program-submissions` and owner-path policies
- Produces state transition RPCs and final `confirm_program_import(uuid)` transaction

- [ ] **Step 1: Write failing schema and safety tests**

```js
test('submission migration separates public catalog, private review, and production import', async () => {
  const sql = await text('supabase/migrations/202608230005_conference_submissions.sql');
  assert.match(sql, /create table public\.program_submissions/i);
  assert.match(sql, /create table public\.conference_programs/i);
  assert.match(sql, /create table private\.submission_events/i);
  assert.match(sql, /create table private\.program_import_records/i);
  assert.match(sql, /submission_kind[\s\S]*'url'[\s\S]*'file'/i);
  assert.match(sql, /status[\s\S]*'submitted'[\s\S]*'imported'[\s\S]*'rejected'/i);
  assert.match(sql, /alter table public\.program_submissions enable row level security/i);
  assert.match(sql, /auth\.uid\(\) is not null[\s\S]*auth\.uid\(\) = user_id/i);
  assert.match(sql, /app_metadata[\s\S]*admin/i);
  assert.match(sql, /confirm_program_import/i);
  assert.match(sql, /insert into public\.embedding_jobs/i);
  assert.match(sql, /program-submissions/i);
});

test('ordinary approval cannot write production papers', async () => {
  const sql = await text('supabase/migrations/202608230005_conference_submissions.sql');
  const transitionBody = sql.match(/create or replace function public\.transition_program_submission[\s\S]*?\$\$;/i)?.[0] ?? '';
  assert.doesNotMatch(transitionBody, /insert into public\.papers|update public\.papers/i);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/conference-submissions-migration.test.mjs`

Expected: FAIL with missing migration.

- [ ] **Step 3: Implement tables, checks, indexes, and RLS**

Use the exact columns from the design spec. Add `official_conference_url`, `discipline`, `rights_attested_at`, `file_name`, `file_size_bytes`, `mime_type`, and `content_sha256`. Enforce exactly one of `program_url`/`storage_path`; bound upload size to 25 MiB and metadata text lengths.

Create indexes for owner/status/time, moderation status/time, unique published conference slug, and duplicate source/hash detection. `program_submissions.user_id` and `submission_events.actor_user_id` use `on delete set null` so accepted provenance survives account deletion; all other user-owned research data remains cascading. Public users may select only published conference programs. Submission owners may select their own rows but cannot update status or review fields directly. Administrators receive an explicit select policy for the moderation queue based on `app_metadata.role`.

- [ ] **Step 4: Implement Storage policies**

Create private bucket `program-submissions`, 25 MiB limit, and MIME allowlist `application/pdf`, `text/csv`, `application/json`, `application/zip`. Authenticated users insert only into `{auth.uid()}/{submission_uuid}/{safe_filename}` and read/delete only their own not-yet-submitted objects. Administrators may read through the Edge service boundary, not a broad browser policy.

- [ ] **Step 5: Implement database transition and confirmation functions**

`transition_program_submission(submission_id, expected_status, next_status, reason)` checks `auth.jwt()->'app_metadata'->>'role' = 'admin'`, validates the allowed transition map, updates with an expected-status predicate, and writes one event.

`confirm_program_import(submission_id)` requires status `import_preview`, preview status `valid`, and admin role. In one transaction it inserts/updates `conference_programs`, upserts staged canonical papers through the existing uniqueness rules, queues embedding jobs for changed embedding content, changes submission to `imported`, and writes an event. If preview contains zero records, publish `coverage_status='program_only'` without touching `papers`.

- [ ] **Step 6: Run and commit**

Run: `node --test tests/conference-submissions-migration.test.mjs tests/corpus-foundation-migration.test.mjs tests/live-hardening-migration.test.mjs`

Expected: PASS.

```bash
git add supabase/migrations/202608230005_conference_submissions.sql tests/conference-submissions-migration.test.mjs
git commit -m "feat: add moderated conference program schema"
```

### Task 2: Implement pure submission validation and state contracts

**Files:**
- Create: `supabase/functions/_shared/program-submission.ts`
- Create: `tests/program-submission-contract.test.mjs`

**Interfaces:**
- Produces: `validateSubmission(input) -> ProgramSubmissionInput`
- Produces: `validateRemoteUrl(url, resolveHost) -> Promise<URL>`
- Produces: `validateFileDescriptor({ name, size, declaredMime, magicBytes })`
- Produces: `canTransition(from, to) -> boolean`

- [ ] **Step 1: Write failing malicious-input tests**

```js
test('URL validation rejects credentials and private destinations', async () => {
  await assert.rejects(() => validateRemoteUrl('https://user:pass@example.org/program', resolver('93.184.216.34')), /credentials/i);
  for (const ip of ['127.0.0.1', '10.0.0.2', '169.254.169.254', '::1', 'fc00::1']) {
    await assert.rejects(() => validateRemoteUrl('https://conference.example/program', resolver(ip)), /private|local/i);
  }
});

test('file validation requires extension, MIME, magic bytes, and size to agree', () => {
  assert.throws(() => validateFileDescriptor({ name: 'program.pdf', size: 30 * 1024 * 1024, declaredMime: 'application/pdf', magicBytes: pdfBytes() }), /25 MiB/);
  assert.throws(() => validateFileDescriptor({ name: 'program.pdf', size: 100, declaredMime: 'application/pdf', magicBytes: zipBytes() }), /signature/i);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/program-submission-contract.test.mjs`

Expected: FAIL because the shared module does not exist.

- [ ] **Step 3: Implement closed validation**

Require conference name, acronym, year 1900–2100, discipline, official conference URL, rights attestation, and exactly one source. Normalize but never follow the submitted URL in this module.

When an administrator later fetches a URL, resolve every redirect destination and reject loopback, RFC1918, link-local, carrier-grade NAT, documentation, multicast, and unique-local IPv6 ranges. Limit redirects to 3, response to 25 MiB, and time to 20 seconds.

- [ ] **Step 4: Implement the state map**

```ts
const transitions = {
  submitted: new Set(['under_review', 'rejected']),
  under_review: new Set(['approved', 'rejected']),
  approved: new Set(['import_preview', 'rejected']),
  import_preview: new Set(['imported', 'rejected']),
  imported: new Set(),
  rejected: new Set(),
} as const;
```

- [ ] **Step 5: Test and commit**

Run: `node --test tests/program-submission-contract.test.mjs`

Expected: PASS.

```bash
git add supabase/functions/_shared/program-submission.ts tests/program-submission-contract.test.mjs
git commit -m "feat: validate program submissions safely"
```

### Task 3: Add authenticated submission API and user form

**Files:**
- Create: `supabase/functions/submit-program/index.ts`
- Create: `tests/submit-program-contract.test.mjs`
- Create: `public/program-submission.js`
- Create: `tests/program-submission-ui.test.mjs`
- Modify: `public/index.html`
- Modify: `public/styles.css`
- Modify: `public/app.js`

**Interfaces:**
- Endpoint: `POST /functions/v1/submit-program`
- Request: validated conference metadata plus `{ kind: 'url', programUrl }` or `{ kind: 'file', storagePath, fileName, fileSizeBytes, mimeType, sha256 }`
- Response: `{ data: { submissionId, status: 'submitted', submittedAt } }`
- Produces: `createProgramSubmissionController({ auth, storage, api, draftStorage })`

- [ ] **Step 1: Write failing endpoint/UI tests**

```js
test('submit endpoint requires a user and never fetches the source', async () => {
  const source = await text('supabase/functions/submit-program/index.ts');
  assert.match(source, /requireAuthenticatedUser/);
  assert.doesNotMatch(source, /fetch\(.*programUrl|Deno\.connect/i);
  assert.match(source, /rightsAttested/);
});

test('draft storage excludes file bytes and expires', () => {
  const draft = serializeSubmissionDraft({ conferenceName: 'Test', file: new Uint8Array([1, 2]) }, 1_000);
  assert.doesNotMatch(draft, /1,2|base64/i);
  assert.equal(readSubmissionDraft(draft, 1_000 + 8 * 24 * 60 * 60 * 1000), null);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/submit-program-contract.test.mjs tests/program-submission-ui.test.mjs`

Expected: FAIL with missing files.

- [ ] **Step 3: Implement submission endpoint**

Use `requireAuthenticatedUser`, validate the JSON body, verify a file path begins with the authenticated user ID, verify object metadata from private Storage, insert the row as `submitted`, and append the first event. Duplicate official URL, program URL, or content hash returns a 409 with a safe message.

- [ ] **Step 4: Implement user form and upload flow**

The form supports URL/file tabs, required rights checkbox, field-level errors, upload progress, retry, and a status confirmation. Upload to the owner path first, compute SHA-256 in the browser, then call `submit-program`. If API submission fails, offer retry or delete the orphan upload.

Store only text metadata as a seven-day local draft under `idea-radar-program-draft`; never store file bytes or access tokens.

- [ ] **Step 5: Test and commit**

Run: `node --test tests/submit-program-contract.test.mjs tests/program-submission-ui.test.mjs tests/auth-client.test.mjs`

Expected: PASS.

```bash
git add supabase/functions/submit-program/index.ts tests/submit-program-contract.test.mjs public/program-submission.js tests/program-submission-ui.test.mjs public/index.html public/styles.css public/app.js
git commit -m "feat: submit conference programs for review"
```

### Task 4: Add public conference library and administrator moderation

**Files:**
- Create: `supabase/functions/review-program/index.ts`
- Create: `tests/review-program-contract.test.mjs`
- Create: `public/conference-library.js`
- Create: `public/admin-submissions.js`
- Create: `tests/conference-library.test.mjs`
- Modify: `public/index.html`
- Modify: `public/styles.css`
- Modify: `public/app.js`

**Interfaces:**
- Endpoint: `POST /functions/v1/review-program` with `{ submissionId, expectedStatus, decision, reason }`
- Decision: `start_review | approve | reject`
- Produces: `loadConferencePrograms({ supabase, filters })`
- Produces: `createAdminSubmissionController({ api, getAccessToken })`

- [ ] **Step 1: Write failing authorization and catalog tests**

```js
test('review requires immutable admin app metadata', async () => {
  const source = await text('supabase/functions/review-program/index.ts');
  assert.match(source, /app_metadata[\s\S]*role[\s\S]*admin/i);
  assert.doesNotMatch(source, /user_metadata[\s\S]*admin/i);
  assert.match(source, /expectedStatus/);
});

test('conference cards always expose reviewed provenance', () => {
  const card = buildConferenceCard({ name: 'ICA', year: 2027, programUrl: 'https://official.example/program', coverageStatus: 'program_only' });
  assert.equal(card.link.href, 'https://official.example/program');
  assert.match(card.status, /program/i);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/review-program-contract.test.mjs tests/conference-library.test.mjs`

Expected: FAIL with missing files.

- [ ] **Step 3: Implement administrator review**

Verify the current user from the bearer token and read `app_metadata.role` from the fresh Auth user response. Require a non-empty reason for rejection. Call the expected-state database transition so stale double reviews return 409.

- [ ] **Step 4: Implement public catalog and submission status views**

Conference cards show name/year/discipline/coverage/paper count/provenance/last verified time and an original program link with `noopener noreferrer`. User submission cards show the full state timeline and safe review reason. The admin view is absent for non-admin users and still protected server-side.

- [ ] **Step 5: Test and commit**

Run: `node --test tests/review-program-contract.test.mjs tests/conference-library.test.mjs tests/static-ui.test.mjs`

Expected: PASS.

```bash
git add supabase/functions/review-program/index.ts tests/review-program-contract.test.mjs public/conference-library.js public/admin-submissions.js tests/conference-library.test.mjs public/index.html public/styles.css public/app.js
git commit -m "feat: moderate and publish conference programs"
```

### Task 5: Build safe import preview for JSON, CSV, ZIP, and program-only PDF

**Files:**
- Create: `supabase/functions/_shared/program-parser.ts`
- Create: `supabase/functions/preview-program-import/index.ts`
- Create: `tests/program-parser.test.mjs`
- Create: `tests/preview-program-import-contract.test.mjs`
- Modify: `public/admin-submissions.js`

**Interfaces:**
- Produces: `parseProgram({ bytes, mimeType, fileName, sourceUrl, conference }) -> ProgramPreview`
- `ProgramPreview`: `{ mode: 'structured'|'program_only', records, rejections, contentSha256 }`
- Endpoint: `POST /functions/v1/preview-program-import` with `{ submissionId }`

- [ ] **Step 1: Write failing parser fixtures and tests**

```js
test('CSV and JSON normalize required canonical paper fields', async () => {
  for (const fixture of [csvFixture(), jsonFixture()]) {
    const preview = await parseProgram(fixture);
    assert.equal(preview.mode, 'structured');
    assert.equal(preview.records[0].title, 'Public Trust and AI');
    assert.ok(preview.records[0].abstract.length >= 20);
    assert.equal(preview.records[0].sourceUrl, 'https://official.example/program');
  }
});

test('PDF is program-only and ZIP rejects traversal or multiple candidate files', async () => {
  assert.equal((await parseProgram(pdfFixture())).mode, 'program_only');
  await assert.rejects(() => parseProgram(zipFixture('../escape.csv')), /path/i);
  await assert.rejects(() => parseProgram(zipFixture(['a.csv', 'b.json'])), /exactly one/i);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/program-parser.test.mjs tests/preview-program-import-contract.test.mjs`

Expected: FAIL with missing parser/function.

- [ ] **Step 3: Implement bounded parsers**

CSV requires headers `title`, `authors`, `abstract`; optional headers include keywords, division, session title, paper URL. JSON requires an array of objects with the same semantic fields. Authors accept a JSON array or semicolon-separated names. Reuse the corpus validation rules and generate deterministic source IDs from submission ID plus row index.

ZIP permits one non-encrypted CSV or JSON entry, no symlink/path traversal, at most 2,000 entries, 25 MiB compressed, and 100 MiB expanded. PDF returns a zero-record program-only preview and never attempts text execution or OCR in this stage.

- [ ] **Step 4: Implement preview endpoint**

Admin only. Revalidate every URL redirect or download the private object, verify size/MIME/magic/hash, parse, store preview summary and private canonical staging records, then transition `approved → import_preview`. Approval remains harmless until this endpoint succeeds.

- [ ] **Step 5: Render preview and commit**

Admin UI shows accepted/rejected counts, sample records, exact rejection reasons, duplicate warnings, and program-only status before enabling Confirm.

Run: `node --test tests/program-parser.test.mjs tests/preview-program-import-contract.test.mjs tests/program-submission-contract.test.mjs`

Expected: PASS.

```bash
git add supabase/functions/_shared/program-parser.ts supabase/functions/preview-program-import/index.ts tests/program-parser.test.mjs tests/preview-program-import-contract.test.mjs public/admin-submissions.js
git commit -m "feat: preview conference program imports safely"
```

### Task 6: Confirm import, process embeddings, and verify end to end

**Files:**
- Create: `supabase/functions/confirm-program-import/index.ts`
- Create: `supabase/functions/process-embedding-jobs/index.ts`
- Create: `supabase/functions/_shared/edge-embedding-worker.ts`
- Create: `tests/confirm-program-import-contract.test.mjs`
- Create: `tests/edge-embedding-worker.test.mjs`
- Modify: `public/admin-submissions.js`
- Create: `docs/operations/moderated-program-imports.md`

**Interfaces:**
- Endpoint: `POST /functions/v1/confirm-program-import` with `{ submissionId }`
- Endpoint: `POST /functions/v1/process-embedding-jobs` with `{ batchSize }`, allowed range 1–25
- Response: `{ data: { processed, completed, failed, pending, ready } }`

- [ ] **Step 1: Write failing confirmation and worker tests**

```js
test('confirmation calls the atomic RPC only after admin verification', async () => {
  const source = await text('supabase/functions/confirm-program-import/index.ts');
  assert.match(source, /requireAdmin/);
  assert.match(source, /confirm_program_import/);
  assert.doesNotMatch(source, /from\(['"]papers['"]\)\.insert/);
});

test('edge worker accepts only 512-dimensional production embeddings', async () => {
  const result = await processBatch({ jobs: [job()], embed: async () => [Array(512).fill(0.01)] });
  assert.equal(result.completed, 1);
  await assert.rejects(() => processBatch({ jobs: [job()], embed: async () => [[0.1]] }), /512/);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/confirm-program-import-contract.test.mjs tests/edge-embedding-worker.test.mjs`

Expected: FAIL with missing files.

- [ ] **Step 3: Implement confirmation and resumable embedding worker**

Confirmation verifies admin and calls the database transaction with the user's JWT. The worker verifies admin, claims jobs through the existing claim RPC, calls `text-embedding-3-small` with `dimensions: 512`, validates all vectors, completes/requeues/fails using the existing job semantics, and never logs abstracts or vectors.

- [ ] **Step 4: Implement administrator progress loop**

After confirmation, the admin page displays corpus status and calls batches only after an explicit **Process embeddings** action. Continue while the tab is open, stop on error, expose retry, and treat the database queue as authoritative so a reload resumes safely.

- [ ] **Step 5: Run all gates**

Run: `npm test && npm run check && npm run build && PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test npm run pages:build`

Expected: PASS.

- [ ] **Step 6: Deploy and perform a reversible live smoke test**

Apply the migration and deploy four functions. Use one small reviewed JSON fixture and one program-only PDF:

- ordinary user submits both and cannot review them;
- admin rejects a malicious/private URL;
- admin approves and previews the JSON without changing paper count;
- confirm increases paper count only by accepted unique rows and queues equal embedding jobs;
- worker completes 512d embeddings and corpus becomes ready;
- PDF publishes a conference program with `program_only` and does not change paper count;
- public conference cards link to reviewed provenance;
- duplicate resubmission returns 409.

Record non-sensitive IDs/counts and rollback SQL in `docs/operations/moderated-program-imports.md`.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/confirm-program-import/index.ts supabase/functions/process-embedding-jobs/index.ts supabase/functions/_shared/edge-embedding-worker.ts tests/confirm-program-import-contract.test.mjs tests/edge-embedding-worker.test.mjs public/admin-submissions.js docs/operations/moderated-program-imports.md
git commit -m "feat: complete moderated program ingestion"
```
