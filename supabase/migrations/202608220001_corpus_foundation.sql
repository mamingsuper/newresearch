-- Corpus Foundation: ingestion audit, recoverable embedding jobs, and live corpus stats.

create table if not exists public.ingestion_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  source_adapter text not null,
  source_label text not null,
  input_sha256 text not null,
  status text not null check (status in ('started', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  total_records integer not null default 0,
  inserted_records integer not null default 0,
  updated_records integer not null default 0,
  unchanged_records integer not null default 0,
  rejected_records integer not null default 0,
  embedding_jobs_created integer not null default 0,
  error_code text
);

create table if not exists public.ingestion_rejections (
  id uuid primary key default extensions.gen_random_uuid(),
  ingestion_run_id uuid not null references public.ingestion_runs(id) on delete cascade,
  source_record_id text,
  reason_code text not null,
  safe_detail text,
  created_at timestamptz not null default now()
);

alter table public.papers
  add column if not exists embedding_input_hash text,
  add column if not exists embedding_model text,
  add column if not exists embedding_dimensions integer check (embedding_dimensions = 512),
  add column if not exists embedding_updated_at timestamptz,
  add column if not exists last_ingestion_run_id uuid references public.ingestion_runs(id) on delete set null;

create table if not exists public.embedding_jobs (
  paper_id uuid primary key references public.papers(id) on delete cascade,
  input_hash text not null,
  model text not null,
  dimensions integer not null check (dimensions = 512),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.ingestion_runs enable row level security;
alter table public.ingestion_rejections enable row level security;
alter table public.embedding_jobs enable row level security;

revoke all on table public.ingestion_runs from anon, authenticated;
revoke all on table public.ingestion_rejections from anon, authenticated;
revoke all on table public.embedding_jobs from anon, authenticated;
grant all on table public.ingestion_runs to service_role;
grant all on table public.ingestion_rejections to service_role;
grant all on table public.embedding_jobs to service_role;

create index if not exists embedding_jobs_pending_idx
  on public.embedding_jobs (status, next_attempt_at)
  where status in ('pending', 'processing');

create or replace function public.claim_embedding_jobs(batch_size integer default 64, lease_seconds integer default 300)
returns table (
  paper_id uuid,
  input_hash text,
  model text,
  dimensions integer,
  attempts integer,
  title text,
  abstract text,
  conference_name text,
  conference_year integer,
  division text,
  keywords text[]
)
language plpgsql
security invoker
set search_path = public, extensions
as $$
begin
  return query
  with claimable as (
    select j.paper_id
    from public.embedding_jobs j
    where (
      (j.status = 'pending' and j.next_attempt_at <= now())
      or (j.status = 'processing' and j.lease_expires_at <= now())
    )
    order by j.next_attempt_at, j.updated_at
    for update skip locked
    limit greatest(least(batch_size, 256), 1)
  ), updated as (
    update public.embedding_jobs j
    set status = 'processing',
        attempts = j.attempts + 1,
        lease_expires_at = now() + make_interval(secs => greatest(lease_seconds, 1)),
        updated_at = now()
    from claimable c
    where j.paper_id = c.paper_id
    returning j.*
  )
  select u.paper_id, u.input_hash, u.model, u.dimensions, u.attempts,
         p.title, p.abstract, p.conference_name, p.conference_year, p.division, p.keywords
  from updated u
  join public.papers p on p.id = u.paper_id;
end;
$$;

create or replace function public.complete_embedding_job(
  target_paper_id uuid,
  target_input_hash text,
  target_model text,
  target_embedding extensions.vector(512)
)
returns boolean
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  affected integer;
begin
  update public.papers p
  set embedding = target_embedding,
      embedding_input_hash = target_input_hash,
      embedding_model = target_model,
      embedding_dimensions = 512,
      embedding_updated_at = now(),
      updated_at = now()
  where p.id = target_paper_id
    and exists (
      select 1 from public.embedding_jobs j
      where j.paper_id = p.id
        and j.input_hash = target_input_hash
        and j.model = target_model
        and j.status = 'processing'
    );
  get diagnostics affected = row_count;
  if affected = 0 then return false; end if;

  update public.embedding_jobs
  set status = 'completed', completed_at = now(), lease_expires_at = null,
      last_error_code = null, updated_at = now()
  where paper_id = target_paper_id
    and input_hash = target_input_hash
    and model = target_model
    and status = 'processing';
  return true;
end;
$$;

create or replace function public.release_embedding_job(
  target_paper_id uuid,
  target_input_hash text,
  error_code text,
  next_attempt timestamptz,
  terminal boolean default false
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  affected integer;
begin
  update public.embedding_jobs
  set status = case when terminal then 'failed' else 'pending' end,
      next_attempt_at = case when terminal then next_attempt_at else next_attempt end,
      lease_expires_at = null,
      last_error_code = error_code,
      updated_at = now()
  where paper_id = target_paper_id
    and input_hash = target_input_hash
    and status = 'processing';
  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

create or replace function public.get_corpus_stats()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'conferences', coalesce((
      select jsonb_agg(row_to_json(x) order by x.name, x.year)
      from (
        select conference_slug as slug, conference_name as name, conference_year as year, count(*)::integer as papers
        from public.papers
        group by conference_slug, conference_name, conference_year
      ) x
    ), '[]'::jsonb),
    'paperCount', (select count(*)::integer from public.papers),
    'papersWithAbstract', (select count(*)::integer from public.papers where length(trim(abstract)) > 0),
    'embeddedPaperCount', (select count(*)::integer from public.papers where embedding is not null),
    'pendingEmbeddingCount', (select count(*)::integer from public.embedding_jobs where status in ('pending', 'processing')),
    'failedEmbeddingCount', (select count(*)::integer from public.embedding_jobs where status = 'failed'),
    'latestSuccessfulIngestionAt', (select max(completed_at) from public.ingestion_runs where status = 'completed'),
    'ready', ((select count(*) from public.papers) > 0 and (select count(*) from public.papers where embedding is not null) > 0)
  );
$$;

revoke all on function public.claim_embedding_jobs(integer, integer) from public, anon, authenticated;
revoke all on function public.complete_embedding_job(uuid, text, text, extensions.vector) from public, anon, authenticated;
revoke all on function public.release_embedding_job(uuid, text, text, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.get_corpus_stats() from public, anon, authenticated;
grant execute on function public.claim_embedding_jobs(integer, integer) to service_role;
grant execute on function public.complete_embedding_job(uuid, text, text, extensions.vector) to service_role;
grant execute on function public.release_embedding_job(uuid, text, text, timestamptz, boolean) to service_role;
grant execute on function public.get_corpus_stats() to service_role;
