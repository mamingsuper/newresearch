-- Switch unfinished corpus embedding work from OpenAI to local Nomic embeddings.
-- Existing paper vectors are intentionally untouched; this rollout starts before any
-- production embeddings have completed, so only unfinished jobs need retargeting.

update public.embedding_jobs
set model = 'nomic-ai/nomic-embed-text-v1.5',
    dimensions = 512,
    status = 'pending',
    attempts = 0,
    next_attempt_at = now(),
    lease_expires_at = null,
    last_error_code = null,
    completed_at = null,
    updated_at = now()
where status in ('pending', 'processing')
  and model <> 'nomic-ai/nomic-embed-text-v1.5';
