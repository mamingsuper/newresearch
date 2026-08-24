# Moderated conference program import runbook

## State flow

`submitted → under_review → approved → import_preview → imported`

Reviewers may move a submission to `rejected` with a reason. Only `imported` conference programs become public. Every transition is validated and recorded in the private event log.

## Review checklist

1. Confirm the conference identity, year, discipline, and official HTTPS source.
2. Confirm the submitter attested distribution rights.
3. For uploads, verify the owner-prefixed storage path, size, declared type, magic bytes, and SHA-256 digest.
4. Generate a preview. Remote retrieval revalidates DNS on every redirect, blocks private/reserved addresses, and enforces response, time, and redirect limits.
5. Inspect accepted and rejected counts. PDF-only programs may be published as `program_only`; they do not create fabricated papers.
6. Confirm import once. The database atomically writes canonical papers, ingestion evidence, public coverage, and pending embedding jobs.
7. Run `process-embedding-jobs` in batches of 1–25 until pending reaches zero, then confirm corpus readiness.

## Recovery

Import confirmation is idempotent by submission status and canonical identifiers. On worker failure, jobs are released with a bounded error code and retry time. Do not manually edit vectors or mark a conference indexed before the queue is empty. Preserve rejected record summaries for audit; never publish raw rejected rows.

