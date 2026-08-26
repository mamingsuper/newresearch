# Codex Composer, Anonymous Trial, and Corpus Library Design

**Approved:** 2026-08-26

## Goal

Turn Idea Radar's analysis entry point into a Codex-style research composer, let a visitor complete one useful analysis before signing in, accept transient PDF/Markdown/TXT context, expose the real APSA/ICA corpus through a safe Edge API, and remove sign-in as a prerequisite for program submission and starting Pro checkout.

## Product rules

- Anonymous visitor: one server-enforced preview, default model, five evidence papers, one attachment, no saved history.
- Signed-in Free: one analysis per day, default model, ten evidence papers, up to three attachments, saved papers and history.
- Pro: thirty analyses per day, 20/100-paper evidence depth, SUPER:Apodex allowance, up to three attachments.
- The model menu uses the Codex interaction pattern: one bottom pill opens rows for Model, Effort, Evidence, and Advanced settings. It does not claim access to Codex models.
- Analysis attachments accept PDF, Markdown, and plain text. Each file is at most 6 MiB. Extracted text is service-only, expires after one hour, and is consumed after the analysis request.
- Text PDFs use `unpdf` in Supabase Edge. Empty/scanned PDFs return an actionable OCR-needed error; user files are not sent to an external OCR provider without separate explicit consent.
- Uploaded content is parsed inside Supabase and used only to derive local PostgreSQL full-text retrieval terms. Raw files and extracted full text are not sent to OpenAI or Apodex without a separate explicit per-request consent feature.
- Anonymous program submissions require a contact email. URL submissions are accepted directly; anonymous files are received by the Edge Function, validated, and stored in the existing private bucket through the service role.
- Anonymous Pro checkout collects email in Stripe. The webhook stores a pending entitlement keyed by a normalized-email SHA-256 hash; login with the same verified email claims it.
- Corpus browsing never grants `anon` or `authenticated` access to `public.papers`. A rate-limited Edge Function exposes an allowlisted, paginated projection.

## UX

The research textarea and file chips sit above a compact bottom toolbar. The left `+` opens a file picker; the central pill shows the active model and effort; the circular arrow submits. Locked options explain the required plan in place. Anonymous users see “1 preview” before use and a sign-in/upgrade continuation after use.

Conference Library starts with two live collection cards populated from corpus status, followed by search, conference filter, and paginated paper cards showing title, authors, abstract, conference, and source link.

Submit Program uses the same compact form for all visitors. Signed-out visitors see a required contact-email field instead of a sign-in wall.

## Security and privacy

- MIME, extension, magic bytes, filename, size, page/text limits, origin, and rate limits are enforced server-side.
- Anonymous identities combine a browser UUID with an HMAC of the request network address. Raw IP addresses and raw emails are not stored.
- Attachment and corpus tables remain RLS-protected and service-role-only.
- Stripe webhook signatures remain mandatory. Pending entitlements can only be claimed by a JWT user whose verified email hashes to the stored value.
- No secrets are added to source code or browser bundles.
