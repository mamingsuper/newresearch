# Research Frontier Radar

Research Frontier Radar helps social-science researchers compare an early-stage idea with recent conference-paper metadata and abstracts. It retrieves related work, explains *where* the overlap occurs, and proposes evidence-linked ways to differentiate the design.

It deliberately does **not** claim to prove global novelty. The strongest permitted conclusion is corpus scoped: “No direct match was found in the currently indexed conference corpus.”

## Current milestone

This repository contains a tested Evidence Beta foundation:

- a browser research-idea workbench;
- a dependency-free Node.js API server;
- deterministic mock mode that runs without credentials;
- canonical ICA 2026 and APSA 2026 normalization adapters;
- a Supabase Postgres/pgvector schema with hybrid keyword-vector retrieval;
- OpenAI Responses and Embeddings REST adapters;
- Tavily Search and bounded Crawl adapters;
- hash-bound corpus validation and canonical NDJSON;
- idempotent Supabase ingestion with audit records;
- recoverable 512-dimensional embedding jobs with bounded retry;
- database-derived corpus readiness via `GET /api/corpus`;
- privacy-aware logging, tests, CI, and deployment build output.

The bundled records are clearly labeled demonstration data. They are not presented as real conference papers.

## Quick start — no credentials

Requirements: Node.js 22.9 or newer.

```bash
cp .env.example .env
npm start
```

Open `http://localhost:3000` and use **Load an example**. `APP_MODE=mock` is the default, so no API keys or database are required.

Run verification:

```bash
npm test
npm run check
npm run build
```

The production-style build is written to `dist/` and can be started with:

```bash
cd dist
npm start
```

## Live architecture

```text
ICA/APSA snapshots + reviewed public conference pages
                         |
              normalizers and provenance
                         |
        Supabase Postgres + pgvector + FTS
                         |
             reciprocal-rank fusion
                         |
          OpenAI structured analysis
                         |
            evidence-grounded report
```

Supabase is the canonical source of truth. Model-derived interpretations never replace titles, abstracts, authors, or original source URLs.

### 1. Create the Supabase schema

Create a free Supabase project and apply:

```text
supabase/migrations/202608210001_initial_schema.sql
supabase/migrations/202608220001_corpus_foundation.sql
```

The migration creates:

- `conference_sources` and its review lifecycle;
- `crawl_runs` with provider/request provenance;
- canonical `papers` with a generated full-text document;
- 512-dimensional pgvector embeddings;
- GIN and HNSW indexes;
- `hybrid_search_papers`, which combines keyword and semantic ranks with reciprocal-rank fusion;
- row-level security and explicit backend-only grants for all corpus tables;
- ingestion audit records and recoverable embedding jobs;
- backend-only RPCs for job claiming/completion/release and corpus statistics.

Keep `SUPABASE_SECRET_KEY` on the server only. Never expose it in browser JavaScript. The legacy `SUPABASE_SERVICE_ROLE_KEY` remains supported as a fallback for older projects.

### 2. Configure live services

Set these values in `.env` or the hosting environment:

```dotenv
APP_MODE=live
OPENAI_API_KEY=...
OPENAI_ANALYSIS_MODEL=gpt-5-mini
OPENAI_MAX_OUTPUT_TOKENS=1800
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
# Optional legacy fallback: SUPABASE_SERVICE_ROLE_KEY=...
EMBEDDING_BATCH_SIZE=64
EMBEDDING_MAX_ATTEMPTS=5
RATE_LIMIT_REQUESTS=10
RATE_LIMIT_WINDOW_MS=60000
```

Live mode is explicit. If a required credential is missing, startup fails rather than silently reverting to mock data. New Supabase secret keys are sent only in the `apikey` header; legacy JWT service-role keys retain bearer authentication compatibility.

The analysis request uses the OpenAI Responses API with JSON-schema output, `store: false`, and a configurable output-token ceiling. Retrieved paper IDs may guide model reasoning, but the server replaces model-supplied titles, conference labels, excerpts, and source URLs with canonical database values before responding. The embedding request asks for 512 dimensions to match the database migration.

## Load a reviewed ICA or APSA corpus

The production corpus flow is deliberately staged so that normalization, database writes, and embedding generation can be reviewed and retried independently.

### 1. Validate a snapshot

```bash
npm run corpus:validate -- \
  --source apsa \
  --input data/raw/apsa-2026.json \
  --output work/apsa-2026.ndjson \
  --report work/apsa-2026.validation.json \
  --max-rejections 0
```

The validation report contains safe rejection metadata and the SHA-256 of the exact NDJSON file. Abstract text is never copied into rejection output.

### 2. Load only the validated file

```bash
npm run corpus:load -- \
  --input work/apsa-2026.ndjson \
  --report work/apsa-2026.validation.json \
  --source-label "APSA 2026 reviewed snapshot"
```

The loader verifies the report hash before any database write. Re-running identical data is idempotent. Metadata-only updates do not recreate embeddings; changes to title, abstract, division, or keywords reset exactly one embedding job.

### 3. Process embeddings

```bash
npm run corpus:embed -- --until-empty
```

Transient OpenAI failures are released for bounded retry. Stale workers cannot overwrite a newer embedding job because completion is bound to the current input hash.

### 4. Inspect live readiness

```bash
npm run corpus:stats -- --json
```

The application also exposes `GET /api/corpus`. Live corpus counts come from Supabase rather than manually maintained environment variables.

### One-command refresh

```bash
npm run corpus:refresh -- \
  --source apsa \
  --input data/raw/apsa-2026.json \
  --work-dir work/apsa-2026 \
  --source-label "APSA 2026 reviewed snapshot"
```

The legacy `import:snapshot` command remains available for local conversion, but the validated corpus commands above are the production path.

## Tavily’s role

`src/tavily/client.mjs` supports:

- Search for candidate public conference programs;
- bounded, same-site Crawl with `allow_external: false`;
- path/domain allowlists and exclusion rules;
- project-level usage tracking.

Tavily is a discovery and generic extraction layer, not an authority to ingest everything automatically. A source should move through:

```text
discovered -> sampled -> reviewed -> active -> paused
```

Stable, important sources should receive dedicated adapters like ICA and APSA. Before activating a source, review access rules, robots guidance, data quality, and whether the pages contain only public scholarly metadata.

## API

### `GET /api/health`

Returns the active mode and database-derived corpus metadata.

### `GET /api/corpus`

Returns indexed conferences, paper/abstract counts, embedding readiness, failed/pending jobs, and the latest successful ingestion timestamp.

### `POST /api/analyze`

```json
{
  "idea": "I want to test whether AI literacy moderates..."
}
```

Successful responses contain:

- structured idea profile;
- corpus coverage notice;
- closest paper-level evidence;
- overlap dimensions;
- innovation paths labeled as inference;
- recommended next steps;
- limitations.

The server accepts at most 32 KB per request and does not write the raw idea to error logs. It also applies a fixed-window in-memory limiter to the analysis endpoint; the defaults are 10 requests per client address per 60 seconds. This limiter is intentionally lightweight and process-local. Multi-instance production deployments should also enforce rate limits at the edge or API gateway.

## Privacy boundary

- Ideas are not intentionally persisted by the application.
- Raw idea text is excluded from server error logs.
- API keys remain server-side.
- Live model requests use `store: false`.
- Model-generated paper metadata is discarded in favor of canonical retrieved records.
- User ideas and retrieved records are treated as untrusted prompt data, not instructions.
- Source records must preserve provenance and public source URLs.
- Conference abstracts are preliminary records, not peer-reviewed findings.

Users should still be told that live-mode text is sent to configured external API providers and is subject to those providers’ terms and retention controls.

## Why Neo4j and Cognee are deferred

The MVP first tests whether hybrid retrieval plus evidence-grounded analysis solves the core user problem. Neo4j/Cognee can later be evaluated on a fixed benchmark for questions involving theory, mechanism, population, method, and dataset relationships. They should be promoted into the production architecture only if GraphRAG materially improves retrieval or innovation guidance.

## Project documents

- Design: `docs/superpowers/specs/2026-08-21-research-frontier-radar-design.md`
- MVP implementation plan: `docs/superpowers/plans/2026-08-21-mvp-vertical-slice.md`
- Corpus Foundation implementation plan: `docs/superpowers/plans/2026-08-22-corpus-foundation.md`
