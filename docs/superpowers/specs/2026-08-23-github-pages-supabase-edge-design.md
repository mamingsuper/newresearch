# GitHub Pages + Supabase Edge Deployment Design

**Date:** 2026-08-23
**Status:** Proposed for implementation after user review
**Product:** Idea Radar / Research Frontier Radar

## Goal

Publish the Idea Radar interface at a stable GitHub Pages URL and make the **Start Testing** flow execute a real research-frontier analysis against the existing Supabase corpus without exposing OpenAI or Supabase secret keys in the browser.

The deployed beta must preserve the product's evidence contract: corpus-scoped claims only, source-grounded paper cards, no global novelty claim, and no invented similarity score.

## Current production facts

- The Supabase corpus contains 8,906 papers: 5,493 APSA 2026 papers and 3,413 ICA 2026 papers.
- All 8,906 production paper vectors are complete and stored at 512 dimensions.
- The production embedding model recorded for every completed job is `text-embedding-3-small`.
- The current repository `main` recently switched the Node retrieval path to local `nomic-ai/nomic-embed-text-v1.5` query embeddings. That query model is incompatible with the existing OpenAI vector space even though both are 512-dimensional.
- PR #5 provides the approved Magic Slide-inspired Idea Radar web interface and already calls the existing analysis API contract.

Therefore the deployment must not send Nomic query vectors to the current production corpus.

## Chosen architecture

```text
Browser
  |
  | GET static files
  v
GitHub Pages
  |  Idea Radar HTML/CSS/JS
  |
  | HTTPS POST /functions/v1/analyze-idea
  | HTTPS GET  /functions/v1/corpus-status
  v
Supabase Edge Functions
  |
  +--> OpenAI /v1/embeddings
  |      model: text-embedding-3-small
  |      dimensions: 512
  |
  +--> Postgres RPC hybrid_search_papers
  |      FTS + pgvector + RRF
  |
  +--> OpenAI /v1/responses
         model: gpt-5-mini
         structured JSON report
         max_output_tokens: 1800
         store: false

Supabase Postgres
  - papers
  - 8,906 OpenAI 512d vectors
  - corpus stats / ingestion metadata
```

GitHub Pages serves only public static assets. All privileged database and OpenAI access stays inside Supabase Edge Functions.

## Production embedding contract

The live corpus and live query path use one explicit production contract:

```text
provider: OpenAI
model: text-embedding-3-small
dimensions: 512
vector column: public.papers.embedding
```

The repository must be corrected so future production ingestion does not enqueue Nomic vectors into the same vector column.

Implementation will:

1. restore the production corpus loader/job default model to `text-embedding-3-small`;
2. restore the production Node query embedding path to OpenAI as the production provider;
3. add a corrective migration that retargets only unfinished production jobs to the OpenAI contract;
4. leave existing completed OpenAI vectors untouched;
5. retain Nomic only as an explicitly experimental/offline path if it remains in the repository, never as an implicit writer into the production vector column.

A production request fails closed if the query model or dimension differs from this contract.

## Edge Function: `analyze-idea`

### Public API

`POST https://euptkcjwunpnwiqejtru.supabase.co/functions/v1/analyze-idea`

Request:

```json
{
  "idea": "string, trimmed, 20 to 5000 characters"
}
```

Success response:

```json
{
  "data": {
    "ideaProfile": {},
    "coverageNotice": "...",
    "closestWork": [],
    "innovationPaths": [],
    "recommendedNextSteps": [],
    "limitations": []
  }
}
```

The response shape remains compatible with the current browser renderer.

### Request flow

1. Handle `OPTIONS` CORS preflight.
2. Accept `POST` only.
3. Enforce a JSON body size limit of 32 KiB.
4. Validate `idea` length exactly as the Node API does: 20 to 5000 trimmed characters.
5. Enforce beta rate limiting before any OpenAI call.
6. Generate one 512-dimensional query embedding with `text-embedding-3-small`.
7. Call `public.hybrid_search_papers` with the raw idea text, query vector, and a maximum of 12 results.
8. If no evidence is returned, construct the existing corpus-scoped abstention report without calling the analysis model.
9. If evidence exists, call the OpenAI Responses API using `gpt-5-mini`, `max_output_tokens: 1800`, `store: false`, and strict structured JSON output.
10. Validate every returned paper reference against the retrieved paper IDs.
11. Overwrite title, conference, evidence excerpt, and source URL with canonical retrieved values before returning the report.
12. Return only safe error codes/messages. Do not proxy provider error bodies to the browser.

### OpenAI analysis contract

The analysis call preserves the existing safeguards:

- model: `gpt-5-mini`;
- `max_output_tokens: 1800`;
- `store: false`;
- structured output using strict JSON Schema;
- model may reference only supplied retrieved paper IDs;
- conference abstracts are treated as preliminary conference records, not peer-reviewed findings;
- research ideas and paper metadata are untrusted data and cannot override developer instructions;
- no statement that an idea is globally novel or has never been studied.

## Edge Function: `corpus-status`

### Public API

`GET https://euptkcjwunpnwiqejtru.supabase.co/functions/v1/corpus-status`

Returns only public corpus metadata needed by the page:

```json
{
  "data": {
    "ready": true,
    "paperCount": 8906,
    "papersWithAbstract": 8906,
    "embeddedPaperCount": 8906,
    "pendingEmbeddingCount": 0,
    "failedEmbeddingCount": 0,
    "conferences": []
  }
}
```

It must not return database credentials, internal worker state, raw rejection payloads, or provider secrets.

The endpoint may return `Cache-Control: public, max-age=60`; the analysis endpoint always returns `Cache-Control: no-store`.

## Browser integration

PR #5 remains the visual base.

The browser no longer assumes same-origin `/api/*` when served on GitHub Pages. It reads a public runtime configuration containing only the Supabase Edge Function base URL.

Checked-in public configuration:

```js
window.__IDEA_RADAR_CONFIG__ = {
  apiBaseUrl: "https://euptkcjwunpnwiqejtru.supabase.co/functions/v1"
};
```

This project URL is public information and is safe to ship. No publishable, secret, service-role, or OpenAI key is embedded in the GitHub Pages artifact.

The page calls:

```text
POST <apiBaseUrl>/analyze-idea
GET  <apiBaseUrl>/corpus-status
```

Local development keeps a same-origin fallback so the existing Node server remains testable locally.

### GitHub Pages subpath compatibility

The site is published at:

```text
https://mamingsuper.github.io/newresearch/
```

Static references must therefore be relative or Pages-aware. Root-absolute references such as `/styles.css` and `/app.js` must not remain in the Pages artifact because they resolve against `mamingsuper.github.io/` instead of `/newresearch/`.

The deployment verifies HTML, CSS, JS, and runtime config load successfully from the repository subpath.

## CORS

The Edge Functions support browser invocation with explicit preflight handling.

Allowed origins are exactly:

```text
https://mamingsuper.github.io
http://localhost:3000
http://127.0.0.1:3000
```

Any other browser `Origin` receives no permissive CORS header.

Responses include the appropriate `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, and `Access-Control-Allow-Headers` values. CORS is not treated as authentication or abuse prevention.

## Secrets and privileged access

`OPENAI_API_KEY` remains a Supabase Custom secret and is read only inside Edge Functions.

A new server-only `RATE_LIMIT_HMAC_KEY` secret is generated during deployment. It is used only to HMAC the client network identifier before rate-limit storage.

Supabase-hosted Edge Functions use the server-side secret key available in the Edge environment for service-role-only RPC/database operations. That secret never reaches the browser.

No secret value is written to repository files, GitHub Actions logs, function responses, or application logs.

## Beta abuse controls

Because the page is intentionally usable without login, anonymous OpenAI usage is bounded server-side.

For the first public beta:

- maximum idea length: 5000 characters;
- maximum request body: 32 KiB;
- maximum retrieved papers sent to analysis: 12;
- analysis model: `gpt-5-mini`;
- analysis output cap: 1800 tokens;
- per-client rate limit: 5 analysis requests per 60 seconds;
- per-client hourly rate limit: 30 analysis requests per 3600 seconds;
- both limits are checked before the embedding call;
- rate-limit key is `HMAC-SHA-256(RATE_LIMIT_HMAC_KEY, normalized-client-network-identifier)`;
- raw IP/network identifier is never persisted;
- rate-limit rows older than two hours are opportunistically deleted by the rate-limit RPC;
- rate-limit rows contain no research idea text;
- provider 429/5xx errors return generic retryable errors to the client;
- raw idea text is never written to normal logs.

The beta does not add accounts, billing, CAPTCHA, or user profile storage in this deployment.

## Rate-limit database primitive

Create a private table:

```text
private.beta_rate_limit_buckets
- client_hash text not null
- window_kind text not null check in ('minute', 'hour')
- window_started_at timestamptz not null
- request_count integer not null
- updated_at timestamptz not null
- primary key (client_hash, window_kind, window_started_at)
```

Create a service-role-only RPC:

```text
public.consume_beta_rate_limit(client_hash text)
  -> allowed boolean, retry_after_seconds integer
```

The RPC atomically checks/increments the minute and hourly buckets, enforces 5/minute and 30/hour, and deletes bucket rows older than two hours. Revoke execute from `public`, `anon`, and `authenticated`; grant execute only to `service_role`.

No user idea is stored in this table or elsewhere by the deployment.

## GitHub Pages deployment workflow

Add a dedicated Pages workflow for `main`.

Build/deploy behavior:

1. checkout repository;
2. install dependencies with the existing lockfile;
3. run the repository verification commands;
4. prepare a Pages artifact containing the static `public/` assets and `.nojekyll`;
5. verify all asset references are valid under `/newresearch/`;
6. use `actions/configure-pages@v5`;
7. use `actions/upload-pages-artifact@v4`;
8. deploy with `actions/deploy-pages@v4`;
9. publish to the `github-pages` environment;
10. expose the deployment URL from the deployment step output.

The deploy job receives `pages: write` and `id-token: write`; repository contents remain read-only.

Repository Pages settings must use **GitHub Actions** as the publishing source. The connector will configure this if an action exists; otherwise this is the only manual repository-setting step required from the user.

## Database changes

A new migration adds only what the deployment requires:

1. corrective production embedding-job contract for unfinished jobs;
2. `private.beta_rate_limit_buckets`;
3. `public.consume_beta_rate_limit(client_hash text)`;
4. service-role-only grants;
5. RLS/revokes consistent with the existing backend-only corpus tables.

The migration does not rewrite completed paper vectors and does not create a user idea table.

## Failure behavior

### Corpus unavailable

Return `503` with a safe message. Do not call OpenAI analysis without retrieval evidence.

### Embedding provider unavailable

Return a retryable `502` or `503`. Do not fall back to another embedding model.

### Analysis provider unavailable

Return a retryable safe error. Retrieved conference data is not exposed as an unvalidated model report.

### No strong evidence

Return the corpus-scoped abstention/empty-evidence report. Absence in the indexed corpus is never converted into a global novelty claim.

### Invalid model contract

Fail closed if the live query embedding model/dimension differs from `text-embedding-3-small` / 512.

## Testing strategy

Implementation follows TDD.

### Unit/contract tests

- request validation: body size, JSON, 20/5000 character bounds;
- CORS preflight and the exact allowed-origin set;
- embedding request uses `text-embedding-3-small` and 512 dimensions;
- query vector must be exactly 512 dimensions;
- hybrid-search result limit is bounded at 12;
- unknown model-generated paper IDs are rejected;
- canonical paper fields overwrite model-provided paper metadata;
- no-evidence path does not invoke the analysis model;
- rate limiting happens before provider calls;
- 5/minute and 30/hour limits are enforced atomically;
- raw network identifiers and raw ideas are not stored by rate limiting;
- no secret appears in browser configuration;
- Pages asset paths work under `/newresearch/`.

### Integration tests

- Edge Function smoke request against the live Supabase project with a harmless test idea;
- `corpus-status` reports 8,906 papers and 8,906 embedded papers before public launch;
- live hybrid search returns both APSA and ICA candidates for known cross-corpus topics;
- malformed requests never trigger OpenAI calls;
- public endpoint returns CORS headers to the GitHub Pages origin;
- a disallowed origin receives no permissive CORS header.

### Deployment verification

After Pages deployment:

1. open `https://mamingsuper.github.io/newresearch/`;
2. verify HTML, CSS, JS, and runtime config load with no 404s;
3. verify the page displays live corpus counts;
4. submit one English idea and one Chinese idea;
5. confirm returned paper links point to canonical source URLs;
6. confirm there is no global novelty wording;
7. confirm browser-delivered source contains no OpenAI or Supabase secret key;
8. confirm rate-limit behavior with controlled test requests;
9. re-run Supabase security advisor after DDL changes.

## Rollback

Frontend rollback is a Git revert of the Pages deployment commit followed by the Pages workflow.

Edge Functions are deployed from repository source; the previous function version can be redeployed if the new version fails.

Database migration is additive and does not rewrite completed paper vectors. The deployment does not delete corpus records or embeddings.

## Non-goals

This deployment does not add:

- user accounts;
- persistent raw research ideas;
- billing/subscriptions;
- GraphRAG/Neo4j/Cognee;
- journal/preprint corpora;
- a second production embedding space;
- a global novelty score.

## Acceptance criteria

The deployment is accepted only when all of the following are true:

1. PR #5 UI is integrated into the deployment branch/main.
2. GitHub Pages is configured to publish with GitHub Actions.
3. `https://mamingsuper.github.io/newresearch/` loads without asset errors.
4. **Start Testing** reaches the Supabase `analyze-idea` Edge Function from the browser.
5. Production query embeddings use `text-embedding-3-small`, 512 dimensions.
6. Database corpus vectors remain 8,906/8,906 complete under the same OpenAI embedding contract.
7. A live English research idea returns a grounded report.
8. A live Chinese research idea returns a grounded report or corpus-scoped abstention without failure.
9. No browser-delivered asset contains secret credentials.
10. Anonymous analysis is bounded at 5 requests/minute and 30 requests/hour per client hash.
11. Supabase security advisor has no unresolved warning introduced by this deployment.
12. Repository tests, syntax checks, build checks, and Pages deployment checks are green.
13. The public page preserves the no-global-novelty and evidence-provenance guarantees.
