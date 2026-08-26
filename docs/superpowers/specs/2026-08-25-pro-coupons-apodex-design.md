# Pro Coupons and SUPER Research Design

**Status:** Approved for implementation from the user's instruction to continue through preview.

**Date:** 2026-08-25

## Goal

Turn the approved React workspace into the production frontend, connect it to the existing Supabase and Stripe backend, add cardless 100%-discount Pro redemption, and give Pro users a controlled Apodex deep-research workflow with selectable evidence depth and complete cited output.

## Product rules

- Anonymous users may browse the public conference library but must sign in to run an analysis or use private workspace features.
- Free users receive one completed default-model analysis per UTC day and always retrieve exactly 10 papers.
- Pro users receive unlimited default-model analyses and may retrieve 20 or 100 papers.
- Pro users may select `SUPER · Apodex`; the launch allowance is five successfully accepted SUPER jobs per UTC calendar month.
- A failed job may be retried without consuming another SUPER credit. An accepted background job consumes once and is idempotent by client request id.
- Free users can see the SUPER option and its explanation, but cannot submit it. The server, not the browser, is authoritative for model and retrieval-depth enforcement.
- Pricing remains $10/month. The SUPER allowance is displayed explicitly and is configurable in SQL without changing browser code.

## Frontend architecture

The React 19/Vite/Tailwind workspace becomes the only production frontend. It is moved into this repository under `frontend/`; production Pages builds run Vite with `base: './'` and copy the generated files into `pages-dist`. The old `public/` implementation remains only until the React build passes functional parity tests, then is no longer used by Pages.

The existing Bauhaus palette, responsive scale, motion, compact navigation, accessible labels, light/dark modes, and bilingual copy remain. Mock adapters are replaced by focused production adapters:

- `runtime.ts`: reads only public runtime configuration.
- `supabase.ts`: owns the browser Supabase client and session subscription.
- `auth.ts`: Google OAuth, magic link, sign-out, and session restoration.
- `billing.ts`: billing status, Checkout, and customer portal.
- `analysis.ts`: default synchronous analysis and SUPER asynchronous job lifecycle.
- `papers.ts`, `sessions.ts`, `account.ts`, and `programs.ts`: existing Edge/API contracts.

The application context hydrates the authenticated user and billing entitlement before enabling protected actions. OAuth callback query/hash errors are surfaced in the authentication dialog, and the URL is cleaned after handling.

## Checkout and coupon design

Stripe is the source of truth for coupons and promotion codes. Coupon definitions and customer-facing promotion codes live in **Stripe Dashboard → Billing → Product catalog → Coupons / Promotion codes**. Coupon secrets are never shipped in the frontend and are not duplicated as plaintext in Supabase.

Checkout Sessions set:

- `allow_promotion_codes=true`, so the hosted Stripe page accepts a promotion code;
- `payment_method_collection=if_required`, so a 100% discount can create the subscription without collecting a card;
- the existing Supabase user id in `client_reference_id` and subscription metadata.

The webhook does not treat `checkout.session.completed.status=complete` as a subscription status. For Checkout completion it retrieves the referenced Stripe subscription and persists the subscription object's `status`, period, price, and discount outcome. `customer.subscription.*` remains the durable subsequent source of truth. Event processing remains signature-verified and idempotent.

Supabase stores customer and subscription identifiers, subscription state, period dates, and safe discount outcome metadata. It does not store a raw promotion code.

## Entitlements and data model

A new migration adds:

- `private.super_usage_monthly(user_id, usage_month, request_count, updated_at)`;
- `private.analysis_jobs(id, user_id, client_request_id, model_key, match_count, status, provider_response_id, idea, retrieved_papers, result, error_code, created_at, updated_at, completed_at)`;
- constraints for supported model keys, match counts, terminal states, and per-user request id uniqueness;
- service-role-only grants and RLS with no browser policies;
- `get_analysis_entitlement_status` extended with `super_remaining` and `super_monthly_limit`;
- `authorize_analysis_request(user, model, match_count, client_request_id)` returning the normalized server-authorized plan/model/count and atomically reserving the applicable allowance;
- job create/read/update RPCs that always scope reads to the authenticated user id supplied by the verified Edge Function.

Authorization behavior is exact:

| Plan | Model request | Match request | Result |
| --- | --- | --- | --- |
| Free | `default` | `10` | allowed once per UTC day |
| Free | `super_apodex` | any | `PRO_REQUIRED` |
| Free | `default` | other | normalized to 10 |
| Pro | `default` | `20` or `100` | allowed |
| Pro | `super_apodex` | `20` or `100` | allowed if SUPER remaining |
| Pro | unsupported model/count | any | `INVALID_ANALYSIS_OPTIONS` |

## Default analysis

The existing OpenAI embedding and grounded JSON report path remains. It receives the server-authorized match count rather than a constant. Free retrieval is 10; Pro retrieval is 20 or 100. The default report contract stays structured for the existing results UI.

## SUPER · Apodex analysis

The browser never receives `APODEX_API_KEY`. After Supabase verifies the user and reserves entitlement, the server embeds the idea, retrieves the authorized 20 or 100 corpus records, and starts an Apodex Responses API background job using `apodex-1-1-deep-research`.

The provider prompt contains:

- the user's complete idea;
- the retrieved conference-paper metadata and abstracts with stable source identifiers;
- a request to map overlap, contradictions, methodological gaps, contribution paths, and concrete next steps;
- a strict rule to distinguish corpus evidence from external web evidence;
- claim-level numbered citations and a final Sources section;
- a request for a complete research memo rather than a short summary.

The prompt does not request hidden chain-of-thought. The product may show safe research actions such as searching, opening sources, and synthesizing evidence. It exposes the complete final answer, provider citations/search results, and canonical corpus references.

`analyze-idea` returns `202` with an internal job id for SUPER. `analysis-job-status` verifies the session, loads only that user's job, polls Apodex when necessary, stores a normalized result on completion, and returns:

```json
{
  "data": {
    "jobId": "uuid",
    "status": "queued|researching|completed|failed",
    "model": "super_apodex",
    "matchCount": 100,
    "progress": { "stage": "researching", "message": "Reviewing evidence sources" },
    "reportMarkdown": "complete final memo",
    "corpusSources": [],
    "webSources": [],
    "superRemaining": 4
  }
}
```

Provider failures use bounded retry with `Retry-After` and jitter for 429/5xx responses. Non-retryable errors store a safe code, never raw prompts, secrets, provider bodies, or chain-of-thought. The UI can resume a job after refresh using the job id in the route and session storage.

## Security and privacy

- All private tables use RLS, are revoked from `public`, `anon`, and `authenticated`, and are accessible only to `service_role` functions.
- The browser build secret scanner includes `APODEX_API_KEY` and Apodex key-shaped values.
- Idea text and full results are never logged by Edge Functions.
- Model, match count, plan, quota, job ownership, and result access are independently enforced server-side.
- Raw payment details remain in Stripe; raw coupon codes are not stored by the application.
- Job status responses use `Cache-Control: no-store`.

## UI behavior

The New Analysis workbench adds two compact controls in its toolbar:

- **Model:** `Default` and `SUPER · Apodex`.
- **Evidence depth:** free shows a locked `10 papers`; Pro shows `20 papers` and `100 papers`.

For free users, SUPER remains visible with a lock, concise capability explanation, and Upgrade to Pro action. For Pro users, selecting SUPER shows monthly remaining credit and explains that it performs long-form deep research. The submit button copy changes to `Start deep research` for SUPER.

The progress page shows durable stages and survives refresh. The result page renders full Markdown safely, provides an explicit corpus-sources section and web-sources section, and never truncates the provider final answer. Source URLs are validated as HTTP(S) before becoming links.

Account and pricing surfaces show the current plan, renewal/cancellation state, default daily remaining amount, SUPER monthly remaining amount, and a note that eligible 100% promotion codes do not require a card.

## Testing and completion evidence

The implementation is complete only when all of these pass:

1. SQL contract tests prove RLS/revokes, constraints, atomic free/SUPER usage, idempotency, and ownership isolation.
2. Checkout tests prove promotion-code input and conditional payment collection.
3. Webhook tests prove zero-payment Checkout uses the actual subscription status and remains idempotent.
4. Analysis contract tests prove every plan/model/count combination is enforced by the server.
5. Apodex unit tests prove background job creation, safe polling, complete final output, citation normalization, retry behavior, and secret/log hygiene.
6. React tests/contract tests prove session restoration, locked/free and enabled/Pro selectors, polling/resume, full result rendering, and real adapters with no mock imports.
7. Production builds, secret scan, Pages subpath behavior, JavaScript/CSS budgets, and the complete existing test suite pass.
8. Local browser QA covers desktop and narrow viewport, light and dark mode, English and Chinese, sign-in modal, Checkout redirect safety, free/default submission, Pro/SUPER progress, and source links.

## Deployment requirements

Required Supabase secrets are configured outside chat and source control: `APODEX_API_KEY` in addition to the existing OpenAI, Stripe, service-role, and rate-limit secrets. Edge Functions and the migration deploy before the Pages frontend so older clients remain compatible during rollout. Live smoke tests use a test Pro account and a Stripe test promotion code before production-mode redemption is enabled.
