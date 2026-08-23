# Research Workbench Results V2 Design

## Goal

Turn the public beta from a brand-heavy landing page into a research-search workbench where the query box dominates the page, search progress is visible, and the result page exposes the top 20 ranked conference papers with readable citations and complete abstracts.

## Scope

This change covers the public GitHub Pages UI and the `analyze-idea` Supabase Edge API response contract. It does not change the production vector model, database schema, corpus ingestion, or rate limiting.

The production corpus remains 8,906 papers: APSA 2026 (5,493) and ICA 2026 (3,413). All 8,906 records have abstracts and authors.

## Homepage layout

The homepage becomes query-first.

- Keep the existing header and live-corpus badge.
- Replace the oversized two-column hero / simulated workbench composition with a centered workbench layout.
- Show a concise corpus summary immediately above the input: `APSA 2026 · 5,493 papers + ICA 2026 · 3,413 papers = 8,906 abstracts`.
- Center the research-idea form in the main content area with a desktop width of roughly 850–1000 px.
- Make the textarea the dominant visual element. Increase input and body typography so the default reading size is at least 16 px, with key explanatory text in the 17–18 px range.
- Keep example prompts and the corpus-scope disclaimer, but visually subordinate them to the input.
- Remove the decorative simulated radar window from the hero. Real progress and real results replace it.

## Search progress experience

The application keeps one POST request to `analyze-idea`; it does not add a background-job subsystem.

The browser shows a staged progress panel under the query form while the request is in flight. Progress advances smoothly through these user-facing milestones:

1. 5% — Understanding the research question
2. 20% — Reading corpus scope: APSA 2026 + ICA 2026
3. 35% — Generating the query embedding
4. 55% — Running Hybrid vector + full-text retrieval
5. 75% — Ranking the most relevant papers
6. 90% — Generating evidence-grounded analysis
7. 100% — Report ready

The percentages between milestones are UI interpolation, not claimed server telemetry. The UI must explicitly say that the scan covers APSA 2026 and ICA 2026 / 8,906 papers. It may approach 90–94% while waiting but must never show 100% until the API returns a successful response. Errors stop the animation and show the existing safe error message.

## Retrieval and result-set contract

The Edge API requests 20 rows from `hybrid_search_papers`. The database RPC already sorts by fused RRF score descending; the API preserves that ordering.

The API returns a `relatedPapers` array containing the top 20 ranked retrieval rows. Each item contains canonical server-owned fields:

- `paperId`
- `rank` (1–20)
- `score`
- `title`
- `authors` (canonical author objects from the database)
- `authorYearLabel`
- `conference`
- `conferenceSlug`
- `conferenceYear`
- `abstract` (full stored abstract, not an excerpt)
- `keywords`
- `division`
- `sessionTitle`
- `sourceUrl`

`authorYearLabel` is server-derived for readability. Examples:

- one author: `Weiner 2026`
- two authors: `Smith & Lee 2026`
- three or more: `Shalaby et al. 2026`
- missing/placeholder author: fall back to conference + year rather than exposing an opaque UUID.

The model is not asked to choose the top 20. Ranking stays deterministic and comes directly from Hybrid RRF retrieval. This avoids losing relevant papers just because the analysis model selected only five.

## Analysis contract

The analysis model still receives the retrieved conference evidence and generates the idea profile, coverage notice, innovation directions, recommended next steps, and limitations.

`closestWork` is no longer the source of the visible paper list. If retained for analytical summaries, it may reference retrieved paper IDs, but the visible Top 20 section always comes from canonical `relatedPapers`.

Innovation-path grounding remains ID-based internally for validation, but the server expands every referenced paper into a readable citation object before returning the response. The public response must never require the UI to show raw UUIDs as citations.

Each grounded reference returned with an innovation path contains:

- `paperId`
- `authorYearLabel`
- `title`
- `conference`
- `sourceUrl`

The UI renders these as readable references such as `Shalaby et al. 2026 — Authoritarian Mobility Management: Controlling Movement in and through Nicaragua`.

## Result-page presentation

The result page keeps the evidence-grounded report header and profile but increases typography and information density.

### Top 20 related papers

- Render a single ranked list from 1 to 20 instead of a two-column grid of five cards.
- The list is sorted by API `rank` / retrieval score descending.
- Each paper row prominently shows rank, author-year label, title, conference, and relevance score.
- Show the complete stored abstract by default. Do not truncate to a 300-character evidence excerpt.
- Show keywords / division when available without letting metadata overwhelm the abstract.
- Keep the source link on every paper.
- Use a comfortably readable body size (about 16 px) and line-height around 1.6.

### Innovation directions

- Keep up to three evidence-linked directions.
- Replace `Grounded in: <uuid>, <uuid>` with readable linked citations.
- Each cited paper displays author-year plus full paper title. UUIDs can remain in DOM data attributes if useful, but must not be the visible reference label.

### Final recommendations and limitations

Increase typography and spacing so these sections read as prose rather than debug output. Any paper reference included in generated text should be supported by a separate readable reference list, not raw IDs embedded in the sentence.

## Data integrity and safety

- All visible paper metadata comes from canonical database retrieval rows, never model-generated title/author/source fields.
- Keep existing grounding validation: model-referenced paper IDs must be a subset of the retrieved rows.
- Keep current CORS, request-size checks, HMAC rate limiting, no-store responses, and model storage-disabled behavior.
- Keep the corpus-scope disclaimer and avoid global novelty claims.
- Do not expose Supabase service credentials, OpenAI keys, HMAC secrets, or internal database-only fields.

## Error handling

- If corpus status is unavailable, the homepage remains usable and the badge falls back gracefully.
- If analysis fails, progress stops and the existing safe public error is shown; 100% is never displayed.
- If retrieval returns fewer than 20 rows, display all returned rows and state the actual count.
- If an author list is malformed or contains only placeholders, use conference/year as the readable citation label.

## Testing

Use TDD for implementation.

Contract tests must verify:

- Edge retrieval requests `match_count: 20`.
- API canonical paper results include full `abstract`, `authors`, `rank`, `score`, and readable author-year labels.
- Innovation-path grounding expands IDs to readable citation objects and rejects unknown IDs.
- The public UI renders Top 20 wording and full abstracts, and does not use UUIDs as visible grounding text.
- Progress UI names APSA 2026 and ICA 2026, presents staged percentage milestones, and cannot mark 100% before successful completion.
- Static Pages build remains secret-safe.

Before merge, run the full repository tests, project check, build, and Pages build, then deploy the updated Edge Function and verify a real English and Chinese analysis plus the public Pages site.