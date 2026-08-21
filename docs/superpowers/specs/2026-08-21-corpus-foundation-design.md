# Corpus Foundation Design

## Status

Approved direction: Route B — Evidence Beta.

This document defines the first implementation cycle only: a reliable, repeatable corpus pipeline that turns reviewed ICA/APSA snapshots into searchable Supabase records with recoverable embedding jobs and dynamic corpus statistics. Retrieval-quality, evidence-UX, and public-beta operations are separate follow-on design cycles.

## Relationship to the existing MVP

The existing MVP already provides:

- ICA 2026 and APSA 2026 normalizers;
- a canonical paper schema;
- Supabase tables and hybrid-search RPC;
- OpenAI embedding and analysis clients;
- Tavily discovery/crawl clients;
- mock and live service modes;
- a browser report workflow;
- privacy-aware logging and runtime validation.

The missing production boundary is the corpus lifecycle between a source snapshot and a live searchable corpus. The current importer stops at normalized NDJSON. This phase adds the database load, idempotent update, embedding queue, retry, statistics, and operational audit trail required for a trustworthy Evidence Beta.

## Goal

Provide one reproducible workflow that validates a reviewed ICA or APSA snapshot, imports it into Supabase without duplicates, queues or refreshes embeddings only when content changes, retries transient embedding failures safely, and exposes accurate corpus readiness statistics to the application.

## Product outcome

After this phase, an operator can run a documented sequence against a free Supabase project and obtain a live corpus that the existing `/api/analyze` flow can query. The website reports the database-derived corpus size and readiness rather than values typed into environment variables.

The user-facing product promise remains corpus-scoped:

> The system reports what it found in the currently indexed conference corpus. It never claims that an idea is globally novel or that nobody has studied it.

## Scope

### Included

- ICA and APSA snapshot validation through existing source-specific adapters.
- Canonical NDJSON as the reviewable interchange format between normalization and database load.
- Idempotent Supabase upsert by `(conference_slug, conference_year, source_record_id)`.
- Content-hash comparison so unchanged records remain no-ops and changed records invalidate stale embeddings.
- An `ingestion_runs` audit table with deterministic counts and safe error summaries.
- An `ingestion_rejections` table with reason codes and source identifiers, excluding abstracts from operational logs.
- A recoverable `embedding_jobs` queue stored in Postgres.
- Batched OpenAI embedding generation using the existing 512-dimensional contract.
- Bounded retry with exponential backoff for transient provider failures.
- Database-derived corpus statistics, including active conferences, paper counts, abstract coverage, embedding readiness, failed jobs, and latest successful import time.
- A new read-only corpus metadata endpoint consumed by health and analysis responses.
- CLI commands for validation, load, embedding, statistics, and end-to-end refresh.
- Unit, integration-contract, migration, and command-line tests.
- Updated operator documentation.

### Explicitly deferred

- Cross-conference probabilistic deduplication of different source IDs.
- Author entity resolution.
- Theory, method, construct, or population extraction.
- Neo4j, Cognee, GraphRAG, or ontology work.
- Tavily-driven unattended activation of new sources.
- Scheduled production crawling.
- User accounts or saved ideas.
- Retrieval reranking, relevance calibration, or abstention logic.
- Changes to the final report UX beyond displaying dynamic corpus metadata.

## Global constraints

- Node.js remains `>=22.9.0`.
- The application keeps zero runtime npm dependencies during this phase.
- Supabase Postgres remains the canonical source of truth.
- The embedding vector remains exactly 512 dimensions.
- User ideas and conference abstracts must not be written to application or CLI logs.
- Live mode must fail closed when required credentials are absent.
- Existing mock mode must continue to run without network access or secrets.
- All new behavior follows test-driven development.
- No command may silently delete canonical paper records.

## Architecture

```text
Reviewed ICA/APSA snapshot
          |
          v
  source adapter validation
          |
          v
 canonical NDJSON + validation report
          |
          v
  idempotent Supabase loader
          |
          +--> ingestion_runs
          +--> ingestion_rejections
          +--> papers upsert
          +--> embedding_jobs enqueue/reset
                         |
                         v
                 embedding worker
                         |
                  OpenAI Embeddings
                         |
                         v
                 papers.embedding
                         |
                         v
                  corpus statistics
                         |
                 /api/corpus + analysis
```

The pipeline is intentionally split into reviewable stages. Normalization never writes directly to the database. Database load never calls the embedding provider. Embedding generation never changes canonical text fields. Each stage can be retried independently.

## File and module boundaries

The implementation plan may adjust exact file names after repository inspection, but responsibilities must remain isolated:

- `scripts/corpus-validate.mjs` — CLI argument parsing and validation command entrypoint.
- `scripts/corpus-load.mjs` — CLI entrypoint for database upsert and job creation.
- `scripts/corpus-embed.mjs` — CLI entrypoint for claiming and processing embedding jobs.
- `scripts/corpus-stats.mjs` — CLI entrypoint for machine-readable statistics.
- `scripts/corpus-refresh.mjs` — thin orchestration of validate, load, embed, and stats.
- `src/corpus/snapshot-reader.mjs` — snapshot/NDJSON reading with size and line validation.
- `src/corpus/validator.mjs` — source-adapter validation and deterministic report creation.
- `src/corpus/embedding-text.mjs` — canonical text composition and input hashing.
- `src/corpus/loader.mjs` — idempotent paper upsert orchestration.
- `src/corpus/embedding-worker.mjs` — batching, retry classification, and result persistence.
- `src/corpus/stats.mjs` — corpus-statistics contract.
- `src/supabase/corpus-client.mjs` — server-only REST/RPC calls used by corpus modules.
- `src/app/create-app.mjs` — add read-only corpus endpoint without embedding operational logic.
- `supabase/migrations/<timestamp>_corpus_foundation.sql` — tables, constraints, indexes, and RPCs.

CLI entrypoints contain no domain logic beyond argument parsing and process exit codes.

## Canonical data flow

### Stage 1: Validate and normalize

Input may be:

- a JSON array;
- an object with a top-level `papers` array;
- canonical NDJSON produced by this project.

The validation command requires an explicit source adapter for raw ICA/APSA JSON. Canonical NDJSON includes a schema version and does not require an adapter.

For each raw record, the validator:

1. invokes the existing source-specific normalizer;
2. validates the canonical paper contract;
3. verifies that `sourceUrl` is an absolute HTTP(S) URL;
4. verifies that title and abstract contain meaningful non-whitespace text;
5. calculates or confirms `rawHash`;
6. writes valid records to canonical NDJSON;
7. writes only safe rejection metadata to the validation report.

The validation report is JSON with this shape:

```json
{
  "schemaVersion": 1,
  "source": "apsa",
  "inputPath": "...",
  "outputPath": "...",
  "totalRecords": 5512,
  "validRecords": 5493,
  "rejectedRecords": 19,
  "rejectionsByReason": {
    "missing_abstract": 12,
    "invalid_source_url": 7
  },
  "outputSha256": "..."
}
```

The report never contains abstracts, user ideas, provider keys, or full raw records.

### Stage 2: Idempotent load

The load command accepts canonical NDJSON only. It creates one `ingestion_runs` row before processing and completes or fails that row transactionally at command boundaries.

Paper identity is the existing unique key:

```text
(conference_slug, conference_year, source_record_id)
```

For each record:

- no existing identity: insert the canonical paper and enqueue an embedding job;
- existing identity with the same `raw_hash`: count as unchanged and make no text or embedding update;
- existing identity with a different `raw_hash`: update canonical mutable fields, clear the stored embedding, and reset or create its embedding job;
- invalid canonical record discovered during load: record an `ingestion_rejections` row and continue unless the configurable rejection threshold is exceeded;
- database or permission failure: fail the run and exit non-zero.

The loader processes bounded batches and uses Supabase server credentials only. It does not delete papers that are absent from the current snapshot. Source removal or archival requires a future explicit reconciliation design.

### Stage 3: Embedding jobs

Every paper needing an embedding has one active job identified by `paper_id` and `input_hash`.

The canonical embedding input is deterministic:

```text
Title: <title>
Conference: <conference name> <year>
Division: <division when present>
Keywords: <comma-separated keywords when present>
Abstract: <abstract>
```

`input_hash` is SHA-256 of the exact UTF-8 embedding input. A completed job is valid only when its hash, model, and dimension match the current paper configuration.

The worker:

1. claims a bounded batch through a Postgres RPC using row locks and `SKIP LOCKED` semantics;
2. marks claimed jobs `processing` with a lease timestamp;
3. submits an array batch to the OpenAI embeddings endpoint;
4. validates one 512-dimensional vector per input;
5. updates `papers.embedding` and embedding metadata;
6. marks jobs `completed`;
7. classifies errors as transient or terminal;
8. releases transient failures to `pending` with exponential backoff;
9. marks terminal or exhausted failures `failed` with a safe error code.

No provider response body containing submitted text is persisted.

Default operational values:

```text
EMBEDDING_BATCH_SIZE=64
EMBEDDING_MAX_ATTEMPTS=5
EMBEDDING_LEASE_SECONDS=300
EMBEDDING_BASE_BACKOFF_SECONDS=30
```

All values are validated as positive integers. The worker can be interrupted and restarted without duplicating canonical records or corrupting completed embeddings.

## Database design

### `ingestion_runs`

Required columns:

```text
id uuid primary key
source_adapter text not null
source_label text not null
input_sha256 text not null
status text: started | completed | failed
started_at timestamptz
completed_at timestamptz nullable
total_records integer
inserted_records integer
updated_records integer
unchanged_records integer
rejected_records integer
embedding_jobs_created integer
error_code text nullable
```

The table stores operational counts, not raw input text.

### `ingestion_rejections`

Required columns:

```text
id uuid primary key
ingestion_run_id uuid references ingestion_runs
source_record_id text nullable
reason_code text not null
safe_detail text nullable
created_at timestamptz
```

`safe_detail` is limited to field names or validation categories. It must not contain abstract text.

### `embedding_jobs`

Required columns:

```text
paper_id uuid primary key references papers on delete cascade
input_hash text not null
model text not null
dimensions integer not null check (dimensions = 512)
status text: pending | processing | completed | failed
attempts integer not null default 0
next_attempt_at timestamptz not null default now()
lease_expires_at timestamptz nullable
last_error_code text nullable
created_at timestamptz
updated_at timestamptz
completed_at timestamptz nullable
```

Indexes support pending-job claims ordered by `next_attempt_at` and operational filtering by status.

### `papers` additions

The canonical paper table gains:

```text
embedding_input_hash text nullable
embedding_model text nullable
embedding_dimensions integer nullable check (embedding_dimensions = 512)
embedding_updated_at timestamptz nullable
last_ingestion_run_id uuid nullable references ingestion_runs
```

Canonical titles, abstracts, authors, and source URLs remain authoritative. Embedding metadata never replaces provenance.

### RPCs

The migration defines backend-only functions:

- `claim_embedding_jobs(batch_size, lease_seconds)`;
- `complete_embedding_job(paper_id, input_hash, model, embedding)`;
- `release_embedding_job(paper_id, error_code, next_attempt_at, terminal)`;
- `get_corpus_stats()`.

All functions revoke public, anon, and authenticated execution and grant only `service_role`.

## Supabase client contract

The corpus client exposes focused methods rather than generic arbitrary-table access:

```ts
interface CorpusStore {
  startIngestionRun(input: StartRunInput): Promise<IngestionRun>;
  upsertPaperBatch(input: UpsertPaperBatchInput): Promise<UpsertBatchResult>;
  recordRejections(input: RejectionInput[]): Promise<void>;
  completeIngestionRun(input: CompleteRunInput): Promise<void>;
  failIngestionRun(input: FailRunInput): Promise<void>;
  claimEmbeddingJobs(input: ClaimJobsInput): Promise<EmbeddingJob[]>;
  completeEmbeddingJob(input: CompleteJobInput): Promise<void>;
  releaseEmbeddingJob(input: ReleaseJobInput): Promise<void>;
  getCorpusStats(): Promise<CorpusStats>;
}
```

The application does not expose these mutation methods through public HTTP routes.

## Command-line interface

Package scripts:

```json
{
  "corpus:validate": "node scripts/corpus-validate.mjs",
  "corpus:load": "node --env-file-if-exists=.env scripts/corpus-load.mjs",
  "corpus:embed": "node --env-file-if-exists=.env scripts/corpus-embed.mjs",
  "corpus:stats": "node --env-file-if-exists=.env scripts/corpus-stats.mjs",
  "corpus:refresh": "node --env-file-if-exists=.env scripts/corpus-refresh.mjs"
}
```

Examples:

```bash
npm run corpus:validate -- \
  --source apsa \
  --input data/raw/apsa-2026.json \
  --output work/apsa-2026.ndjson \
  --report work/apsa-2026.validation.json

npm run corpus:load -- \
  --input work/apsa-2026.ndjson \
  --source-label "APSA 2026 reviewed snapshot"

npm run corpus:embed -- --until-empty

npm run corpus:stats -- --json

npm run corpus:refresh -- \
  --source ica \
  --input data/raw/ica-2026.json \
  --work-dir work/ica-2026
```

Exit codes:

```text
0 success
2 invalid command arguments or validation threshold exceeded
3 configuration or credential error
4 upstream provider failure after bounded retry
5 database or migration contract failure
```

CLI stdout is concise and machine-readable when `--json` is supplied. stderr never prints abstracts.

## Dynamic corpus metadata

A new `GET /api/corpus` endpoint returns:

```json
{
  "data": {
    "conferences": [
      { "slug": "apsa", "name": "APSA", "year": 2026, "papers": 5493 }
    ],
    "paperCount": 5493,
    "papersWithAbstract": 5493,
    "embeddedPaperCount": 5493,
    "pendingEmbeddingCount": 0,
    "failedEmbeddingCount": 0,
    "latestSuccessfulIngestionAt": "2026-08-21T00:00:00.000Z",
    "ready": true
  }
}
```

`ready` is true when:

- at least one paper exists;
- at least one embedding exists;
- no migration-contract error is present.

It does not require every paper to be embedded, because a newly refreshed corpus may be partially available. The response exposes readiness counts so the UI can disclose partial coverage.

In live mode, `createServices` obtains corpus metadata from the database through a short-lived in-memory cache with a default TTL of 60 seconds. `CORPUS_CONFERENCES` and `CORPUS_PAPER_COUNT` are removed from live operational requirements. Mock mode continues to return deterministic sample metadata.

## Failure and retry policy

### Validation failures

- Record-level failures are collected and reported.
- The command fails when rejected records exceed either `--max-rejections` or `--max-rejection-rate`.
- Defaults are zero absolute rejections and a 0% rejection rate for reviewed snapshots.
- Operators may set an explicit non-zero threshold after reviewing the report.

### Supabase failures

- Authentication, permission, schema, or invalid-RPC errors are terminal.
- HTTP 429, 502, 503, and 504 receive at most three attempts with exponential backoff and jitter.
- Other 4xx responses are terminal.

### OpenAI embedding failures

Transient:

- timeout;
- connection reset;
- HTTP 408, 409, 429, 500, 502, 503, or 504.

Terminal:

- invalid API key;
- invalid model;
- malformed input rejected by the provider;
- vector dimension mismatch;
- non-retryable 4xx response.

The worker records only normalized error codes such as `provider_rate_limited`, `provider_timeout`, `invalid_embedding_dimensions`, or `max_attempts_exceeded`.

## Concurrency and idempotency

- Multiple loader processes may run, but the unique paper identity prevents duplicate canonical rows.
- A changed paper may enqueue or reset only one embedding job because `embedding_jobs.paper_id` is the primary key.
- Multiple embedding workers may run because jobs are claimed through row locks and leases.
- A worker completing an old hash cannot overwrite a newer paper state; completion requires the claimed `input_hash` to equal the current job and paper embedding-input hash.
- Expired processing leases return to the pending claim pool.

## Security and privacy

- All corpus mutation paths require a Supabase secret/service-role key.
- No browser code receives database service credentials or OpenAI keys.
- RLS remains enabled on all corpus tables.
- `anon` and `authenticated` retain no direct access to corpus mutation tables or RPCs.
- Snapshot paths, source identifiers, counts, and hashes may appear in operator output.
- Abstracts, user ideas, provider request bodies, and provider keys may not appear in logs, rejection rows, or ingestion-run error details.
- Source URLs must remain public HTTP(S) URLs and preserve provenance.
- The pipeline does not scrape or import email addresses, login tokens, personal schedules, or restricted conference data.

## Observability

Each command emits a final summary containing:

- command name;
- ingestion run ID when applicable;
- source label;
- counts;
- elapsed milliseconds;
- exit status;
- safe error code when failed.

The embedding worker also reports:

- claimed jobs;
- completed jobs;
- retried jobs;
- failed jobs;
- provider batches;
- elapsed milliseconds.

No external observability vendor is introduced in this phase. Structured JSON output is sufficient for GitHub Actions or a future host to capture.

## Testing strategy

### Unit tests

- canonical embedding-text composition and hash stability;
- validation reason classification;
- unchanged, inserted, and changed upsert decisions;
- retry classification and exponential-backoff bounds;
- corpus-statistics schema validation;
- CLI argument parsing and exit-code mapping.

### Contract tests

Use injected `fetch` implementations to verify:

- Supabase request paths, headers, RPC bodies, and safe error handling;
- OpenAI array-batch embedding request and 512-dimensional response validation;
- retries occur only for approved transient statuses;
- logs omit abstract fragments and API keys.

### Migration tests

Static migration tests assert:

- required tables and constraints;
- RLS on every new table;
- explicit revoke/grant statements;
- claim/completion/release/statistics RPCs;
- `SKIP LOCKED` job claiming;
- dimension checks and indexes.

### Command integration tests

Run real child processes against fixture snapshots and a local fake HTTP server:

- validation creates expected NDJSON and report;
- load command sends correct batches and reports deterministic counts;
- embedding command processes multiple batches and retries a simulated 429;
- refresh command stops on validation failure;
- no command prints fixture abstract text.

### Regression suite

The existing full suite, syntax check, and build remain required:

```bash
npm test
npm run check
npm run build
```

## Rollout sequence

1. Add migration and static migration tests.
2. Add corpus contracts and deterministic embedding text.
3. Add validation command and fixture coverage.
4. Add loader with mocked Supabase contract tests.
5. Add embedding worker with red/green retry tests.
6. Add corpus statistics and `/api/corpus`.
7. Update live service metadata to use the database cache.
8. Run the pipeline against small reviewed ICA/APSA fixtures.
9. Run a full local snapshot validation without database writes.
10. Run a live Supabase smoke import only when credentials are available.
11. Open an implementation PR with verification evidence and no automatic merge.

## Audit gate

The Corpus Foundation phase passes internal audit only when all of the following are evidenced:

1. Every new production behavior was developed through a failing test first.
2. Existing mock analysis behavior remains unchanged and offline-capable.
3. Running the same canonical NDJSON twice produces zero duplicate papers and zero unnecessary embedding jobs on the second load.
4. Changing one paper abstract updates exactly one canonical row and creates or resets exactly one embedding job.
5. A simulated interrupted embedding worker can resume without corrupting completed vectors.
6. A stale worker cannot overwrite an embedding for newer content.
7. Transient provider errors retry within bounded attempts; terminal errors do not retry.
8. `GET /api/corpus` reports database-derived counts and partial embedding readiness.
9. No test or command output contains fixture abstract text, user idea text, or credentials.
10. New Supabase tables and RPCs remain inaccessible to `anon` and `authenticated` roles.
11. `npm test`, `npm run check`, and `npm run build` complete with zero failures.
12. A final code review finds no Critical or Important issues.

## Evidence Beta roadmap after this phase

Subsequent cycles remain intentionally separate:

1. **Retrieval Quality** — bilingual idea planning, query expansion, dimension-aware reranking, relevance calibration, abstention, and offline retrieval evaluation.
2. **Evidence UX** — idea-profile confirmation, relationship categories, sentence-level evidence, readable citations, export, and anonymous usefulness feedback.
3. **Public Beta Operations** — provider timeouts/retries across analysis paths, readiness checks, deployment, monitoring, repository metadata, and beta documentation.
4. **GraphRAG experiment** — compare hybrid RAG against Cognee/Neo4j on the same benchmark; promote only if it materially improves theory, mechanism, or method guidance.

Each cycle receives its own reviewed design specification and implementation plan.