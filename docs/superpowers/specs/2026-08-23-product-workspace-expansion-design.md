# Idea Radar Product Workspace Expansion Design

## Goal

Evolve Idea Radar from a strong public research-analysis demo into a readable, focused product where researchers can keep a private evidence workspace and contribute conference programs without weakening the integrity of the production corpus.

The expansion must deliver four outcomes:

1. make essential text comfortably readable and concentrate the interface around one research task at a time;
2. let users submit conference program URLs or files through a moderated workflow;
3. add secure registration and sign-in, paper saving, opt-in conversation history, and paper/abstract export;
4. add the privacy, accessibility, administration, and recovery behavior expected from a durable public product.

## Current-state evidence

The existing production system is a GitHub Pages static frontend backed by Supabase Edge Functions and PostgreSQL. It has 8,906 embedded APSA 2026 and ICA 2026 papers, public `analyze-idea` and `corpus-status` functions, HMAC-backed rate limiting, RLS-protected corpus tables, and a passing baseline of 83 Node tests plus project check, application build, and Pages build.

The current global body size is 16px, but many essential labels, chips, metadata rows, counters, and navigation elements use approximately 10–13px text. The main analysis flow is functional, but the public page has no authenticated shell, conference directory, personal library, submission queue, or saved-session data model.

## Product principles

- Anonymous idea analysis remains available without a registration wall.
- The interface shows one dominant task instead of a dashboard full of competing modules.
- Raw ideas and reports are not persisted by default. A signed-in user must explicitly choose to save an analysis.
- Paper metadata shown to users remains canonical database data, not model-generated metadata.
- Submitted programs never enter the production corpus without moderation and a reviewed import preview.
- User data is private by default and isolated with PostgreSQL RLS.
- The product remains deployable as a GitHub Pages frontend with Supabase as its backend; no framework rewrite is required.

## Chosen architecture

Use an incremental Supabase workspace architecture:

- keep the existing Vanilla HTML/CSS/JavaScript frontend and Pages deployment;
- add Supabase Auth for email one-time-password/magic-link sign-in, with Google and GitHub OAuth supported by the same client boundary when configured;
- add user-owned PostgreSQL tables protected by RLS;
- add small Edge Functions for operations that require service credentials, administrator authorization, secure export, or ingestion orchestration;
- keep public corpus retrieval separate from private user data;
- reuse the existing ingestion, validation, embedding, and corpus readiness pipeline only after a submission is approved.

### Rejected alternatives

**Full React/Next.js rewrite:** stronger component conventions, but it unnecessarily replaces a stable public frontend and changes hosting, routing, and deployment at the same time as Auth and ingestion changes.

**Local-storage and email-only extensions:** fast to ship, but cannot provide cross-device history, trustworthy RLS isolation, moderated submissions, or durable user ownership.

## Information architecture

### Desktop shell

Use a focused research workspace with a narrow persistent sidebar and a centered work surface.

Sidebar destinations:

1. New analysis
2. Conference library
3. Saved papers
4. Conversations
5. Submit a program
6. Account

Anonymous visitors see New analysis, Conference library, Submit a program, and Sign in. User-owned destinations can remain visible but open the sign-in panel when selected. The sidebar collapses to an accessible menu drawer below 900px.

The main reading column is 760–980px. Full-width sections are reserved for ranked-paper tables or side-by-side controls that genuinely require the space. A signed-in home view may show a small recent-work section below the primary action, but it must not become a dense dashboard.

### Typography and spacing contract

- body and long-form abstracts: 18px minimum on desktop, 17px minimum on mobile;
- inputs, buttons, navigation, and table cells: 16px minimum;
- secondary metadata and helper copy: 14px minimum;
- monospace uppercase labels: 13px minimum with normal-readable contrast;
- long-form line height: 1.65–1.75;
- content paragraphs: 70–82 characters per line where practical;
- interactive targets: at least 44px in either height or combined target area;
- no essential meaning may exist only in hover content.

Existing visual identity—paper background, strong ink borders, blue/yellow/green accents—remains, but shadows, pills, and dense borders are reduced where they compete with reading.

### Public analysis flow

The anonymous flow remains query-first:

1. enter a research idea;
2. run the existing grounded analysis;
3. inspect ranked papers and full abstracts;
4. optionally sign in to save the report or papers;
5. export selected evidence without requiring persistence.

Results prioritize title, readable citation, abstract, and evidence relationship. Conference/division/score metadata appears in a secondary row. On mobile, metadata wraps below the title rather than shrinking.

## Authentication and account experience

Supabase Auth is the sole identity provider boundary.

Initial methods:

- email OTP/magic link;
- Google OAuth when configured;
- GitHub OAuth when configured.

The application never stores passwords. The frontend uses the public Supabase URL and publishable key only. Session refresh is handled by the Supabase client. Auth callback state is validated, and the app returns users to the action that triggered sign-in.

The account page provides:

- display name and interface language;
- data export;
- delete saved analyses and favorites;
- delete account request;
- privacy explanation and sign out.

Account deletion removes or anonymizes user-owned rows according to foreign-key policy while preserving aggregate operational audit records that contain no raw idea or message content.

## Personal research workspace

### Saved papers

A signed-in user can save or unsave any canonical paper. The operation is an idempotent upsert/delete. A saved item can include a private note and tags. The library supports search, conference filtering, selection, bulk export, and source-link access.

### Conversations and saved analyses

An anonymous or signed-in analysis is ephemeral until the user explicitly selects **Save to workspace**. Saving creates one `analysis_session` containing the original idea, the canonical grounded report JSON, a title, language, and the corpus snapshot metadata visible at analysis time.

The initial release treats one idea and one grounded report as the first two messages in a conversation. Later follow-up interactions append to `analysis_messages`; they do not silently rerun or mutate the original evidence set. A user can rename, reopen, export, or delete a session.

The public privacy copy changes from an absolute non-persistence statement to an explicit contract: analyses are ephemeral unless a signed-in user chooses to save them.

### Exports

Selected papers can be exported as:

- CSV with canonical metadata and full stored abstract;
- BibTeX with standard citation fields and the original program URL;
- Markdown with readable citations, abstracts, and provenance links.

A saved analysis can be exported as Markdown containing the idea, grounded report, cited papers, limitations, and corpus scope. Export code must escape CSV, BibTeX, and Markdown control characters and must not include internal secrets, private user identifiers, embedding vectors, or database-only fields.

## Conference library and program submissions

### Public conference library

The conference library lists only reviewed and published `conference_programs`. Each entry contains conference name, acronym, year, discipline, coverage status, paper count where available, original program URL, provenance notes, and last verified time.

Users can open the original program through its source URL. Uploaded program files are not publicly republished unless an administrator confirms the submitter's rights and the product's legal basis to host the file.

### Submission form

Signed-in users can submit:

- an HTTPS conference program URL;
- a PDF, CSV, JSON, or ZIP program file to a private Storage bucket;
- conference name, acronym, year, discipline, official conference URL, and notes;
- a required rights/provenance attestation.

The form saves a draft locally in the browser until submission. The database record is created only when the authenticated user submits the form. Submitted records enter a private moderation queue. Links are not fetched and files are not parsed before authorization and validation.

### Submission lifecycle

Allowed states:

`client-only draft → submitted → under_review → approved → import_preview → imported`

Rejection may occur from `submitted`, `under_review`, or `import_preview`. A rejected submission records a user-visible reason and may be revised into a new submission linked through `supersedes_submission_id`. State transitions are enforced server-side and recorded in `submission_events`.

### Moderation and import

Administrators use a protected moderation view to:

1. inspect provenance and rights attestation;
2. check duplicate conference/year/program entries;
3. validate the destination host and content type;
4. inspect uploaded files with bounded size and type rules;
5. approve or reject the submission;
6. run the appropriate parser in an isolated import job;
7. review normalized records, rejection counts, and source URLs;
8. confirm ingestion and embedding.

Approval does not itself write papers to the production corpus. Final import confirmation invokes the existing validation → load → embed → stats pipeline and records the resulting ingestion run.

## Data model

All IDs are UUIDs generated by PostgreSQL. All timestamps use `timestamptz`.

### `public.profiles`

- `user_id uuid primary key references auth.users(id) on delete cascade`
- `display_name text`
- `preferred_language text check in ('en', 'zh')`
- `created_at`, `updated_at`

### `public.saved_papers`

- `user_id uuid references auth.users(id) on delete cascade`
- `paper_id uuid references public.papers(id) on delete cascade`
- `note text` with a bounded length
- `tags text[]` with bounded item and count validation
- `created_at`, `updated_at`
- primary key `(user_id, paper_id)`

### `public.analysis_sessions`

- `id uuid primary key`
- `user_id uuid references auth.users(id) on delete cascade`
- `title text`
- `idea_text text` with the same 5,000-character public input limit
- `report jsonb` validated by the server-owned report contract
- `language text check in ('en', 'zh')`
- `corpus_snapshot jsonb` containing public counts/model identifiers only
- `created_at`, `updated_at`

### `public.analysis_messages`

- `id uuid primary key`
- `session_id uuid references analysis_sessions(id) on delete cascade`
- `user_id uuid references auth.users(id) on delete cascade`
- `role text check in ('user', 'assistant')`
- `content jsonb` validated by role-specific constraints
- `created_at`

### `public.program_submissions`

- `id uuid primary key`
- `user_id uuid references auth.users(id) on delete cascade`
- conference identity fields
- `submission_kind text check in ('url', 'file')`
- `program_url text` or `storage_path text`, exactly one populated
- `rights_attested boolean not null`
- `status text` constrained to `submitted`, `under_review`, `approved`, `import_preview`, `imported`, or `rejected`
- `supersedes_submission_id uuid references public.program_submissions(id)` for user revisions
- `review_reason text`
- `created_at`, `updated_at`, `submitted_at`

### `private.submission_events`

- `id bigint generated always as identity primary key`
- `submission_id uuid`
- `actor_user_id uuid`
- `from_status`, `to_status`, `event_type`, `detail jsonb`
- `created_at`

No raw secret, access token, or uploaded file content is stored in the event detail.

### `public.conference_programs`

- `id uuid primary key`
- `slug text unique`
- conference identity and discipline fields
- `program_url text`
- `source_submission_id uuid`
- `coverage_status text check in ('program_only', 'indexed', 'partial', 'retired')`
- `paper_count integer`
- `provenance_note text`
- `published_at`, `last_verified_at`

## Authorization and RLS

- `profiles`: users select/update their own row; public users cannot enumerate profiles.
- `saved_papers`: owner-only select/insert/update/delete.
- `analysis_sessions`: owner-only select/insert/update/delete.
- `analysis_messages`: access requires ownership of the parent session and matching `user_id`.
- `program_submissions`: owners can read their rows; creation and rejected-revision submission use the validated `submit-program` boundary. Owners cannot approve, import, or change administrator fields.
- `conference_programs`: public read access to published rows; administrator-only writes.
- `submission_events`: no direct public access.

Administrator authorization comes from immutable server-managed `auth.users.app_metadata.role = 'admin'`. User-controlled metadata never grants elevated access. Edge Functions revalidate the authenticated JWT and role for every privileged transition.

## Edge/API boundaries

Add focused functions rather than one general user API:

- `save-analysis`: validates the current report contract and persists an explicitly requested session;
- `export-library`: returns a validated export for the authenticated user's selected paper IDs;
- `submit-program`: validates metadata, HTTPS URLs, upload references, rights attestation, and creates the submitted state;
- `review-program`: administrator-only state transition and review reason;
- `preview-program-import`: administrator-only parser run producing a validation preview;
- `confirm-program-import`: administrator-only confirmation that starts the existing ingestion pipeline.

Simple owner CRUD for favorites may use the Supabase client directly under RLS. Service-role keys remain confined to Edge Functions.

## Link, file, and ingestion safety

- accept only `https:` URLs;
- reject embedded credentials, fragments used as data payloads, localhost, private/link-local IP ranges, and redirect chains to disallowed destinations;
- use strict time, size, redirect, and same-site bounds for any approved fetch;
- permit only reviewed MIME types and magic-byte matches;
- scan archive entry count, expanded size, and path traversal before parsing ZIP files;
- store uploads in a private bucket with owner-prefixed paths and bounded size;
- never execute macros, scripts, HTML, or downloaded binaries;
- preserve the original source and content hash for every import;
- detect duplicate conference/year/source/hash combinations before import;
- require abstracts and provenance according to the existing corpus validator.

## Error and recovery behavior

- Auth interruption returns the user to the triggering action after sign-in.
- Favorite writes are optimistic but roll back on failure and remain idempotent.
- Saved-analysis failure leaves the current report visible and offers retry; it never claims success before the row is confirmed.
- Export failures identify the invalid paper or format without exposing internal errors.
- Submission validation preserves entered metadata and shows field-specific errors.
- Every moderation transition is atomic; partial transitions are rolled back.
- Import preview and production import are separate, resumable operations.
- Corpus readiness is recomputed after import; a failed embedding batch cannot mark the new conference ready.

## Accessibility and internationalization

- English and Chinese UI copy are stored in a small keyed dictionary, not duplicated markup.
- User language preference is stored in `profiles`; anonymous preference stays local.
- All navigation, dialogs, menus, save controls, and paper actions are keyboard accessible.
- Focus moves predictably after sign-in, analysis completion, save, and submission.
- Color is never the sole status signal.
- Reduced-motion preference disables interpolated progress and decorative animation.
- Automated tests cover landmarks, labels, focusable controls, minimum typography tokens, and mobile breakpoints; manual QA covers screen-reader announcements and 200% zoom.

## Administration and product quality

The first administrator view includes submission counts, queue filters, provenance, duplicate warnings, preview results, review actions, and ingestion run status. It does not expose OpenAI keys, Supabase server keys, HMAC secrets, or other users' private research sessions.

Operational events record coarse success/failure counts and latency without raw ideas, abstracts, message text, tokens, or user-identifying payloads. Product analytics and third-party telemetry are not added without a separate explicit decision.

## Delivery decomposition

This architecture is implemented as four independently testable subprojects. Each receives its own implementation plan and review gate.

### A. Readable focused workspace

Deliver the responsive navigation shell, typography contract, concentrated analysis/results layout, account-aware placeholders, bilingual copy infrastructure, and accessibility improvements. No database migration is required.

### B. Auth and private research library

Deliver Supabase Auth, profiles, saved papers, explicit saved analyses, conversation reopening/deletion, and CSV/BibTeX/Markdown export. Preserve anonymous analysis and opt-in persistence.

### C. Moderated conference programs

Deliver the public conference directory, private program submission form/storage, moderation state machine, administrator review view, import preview, and confirmed ingestion handoff.

### D. Product hardening

Deliver account data export/deletion, administrator audit improvements, bilingual QA, mobile/zoom/screen-reader verification, failure recovery tests, live smoke tests, and operational documentation.

## Testing strategy

Use test-driven development for every subproject.

Required automated evidence:

- typography and responsive shell contract tests;
- safe DOM rendering without `innerHTML` interpolation;
- Auth state and post-sign-in intent restoration tests;
- migration tests for constraints, indexes, grants, and RLS policies;
- two-user isolation tests for favorites, sessions, messages, and submissions;
- explicit-save tests proving analysis is not persisted before the user action;
- favorite idempotency and delete tests;
- CSV/BibTeX/Markdown escaping and secret-scan tests;
- submission state-machine and administrator authorization tests;
- malicious URL, redirect, MIME, archive, duplicate, and oversized-input rejection tests;
- import preview tests proving approval alone cannot modify `papers`;
- existing corpus, RAG grounding, rate-limit, Pages, and embedding tests remain green.

Required verification before each production rollout:

1. `npm test`
2. `npm run check`
3. `npm run build`
4. `npm run pages:build`
5. rendered desktop, mobile, keyboard, and 200% zoom QA
6. migration advisor/RLS review for database stages
7. real anonymous English and Chinese analysis
8. real signed-in owner-isolation and export smoke tests for stage B
9. real moderated URL/file submission and import-preview smoke tests for stage C

## Rollout and compatibility

- Schema migrations are additive; existing public corpus tables and Edge contracts remain operational.
- The public analysis page ships before Auth-dependent actions become active.
- Auth controls are feature-detected so a configuration failure does not break anonymous analysis.
- User-owned tables and policies deploy before the UI exposes corresponding actions.
- Submission ingestion ships behind administrator-only access until at least one real program completes preview and rejection testing.
- Every stage can be rolled back at the frontend level without deleting user data or changing the production vector space.

## Acceptance criteria

The expansion is complete only when:

- essential page text meets the typography contract and the desktop/mobile layouts pass visual and accessibility QA;
- anonymous analysis still works against the 8,906-paper live corpus;
- a user can register/sign in, save and remove papers, explicitly save/reopen/delete an analysis, and export canonical papers with abstracts;
- two authenticated test users cannot access each other's favorites, analyses, messages, or submissions;
- a user can submit an HTTPS program link or supported file and track its review status;
- an administrator can approve/reject, preview a parser result, and separately confirm ingestion;
- approval without import confirmation cannot change the production corpus;
- published conference pages link to reviewed program provenance;
- all automated and live verification gates pass without exposing secrets or persisting unsaved raw ideas.
