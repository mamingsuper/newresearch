-- Research Frontier Radar: canonical conference corpus and hybrid retrieval.
create schema if not exists extensions;
create extension if not exists vector with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.conference_sources (
  id uuid primary key default extensions.gen_random_uuid(),
  conference_slug text not null,
  conference_name text not null,
  conference_year integer not null check (conference_year between 1900 and 2200),
  homepage_url text,
  program_url text not null,
  source_type text not null check (source_type in ('snapshot', 'html', 'allacademic', 'pdf', 'javascript', 'api')),
  discovery_method text not null check (discovery_method in ('manual', 'tavily', 'adapter')),
  status text not null default 'discovered' check (status in ('discovered', 'sampled', 'reviewed', 'active', 'paused')),
  robots_checked_at timestamptz,
  last_crawled_at timestamptz,
  last_success_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conference_slug, conference_year, program_url)
);

create table if not exists public.crawl_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  conference_source_id uuid not null references public.conference_sources(id) on delete cascade,
  provider text not null,
  status text not null check (status in ('started', 'completed', 'failed', 'cancelled')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  discovered_url_count integer not null default 0,
  extracted_record_count integer not null default 0,
  error_code text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.papers (
  id uuid primary key default extensions.gen_random_uuid(),
  conference_source_id uuid references public.conference_sources(id) on delete set null,
  source_record_id text not null,
  conference_slug text not null,
  conference_name text not null,
  conference_year integer not null check (conference_year between 1900 and 2200),
  title text not null,
  abstract text not null,
  authors jsonb not null default '[]'::jsonb,
  division text,
  session_title text,
  session_type text,
  keywords text[] not null default '{}',
  source_url text not null,
  retrieved_at timestamptz not null,
  raw_hash text not null,
  embedding extensions.vector(512),
  search_document tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conference_slug, conference_year, source_record_id)
);

-- PostgreSQL requires generated-column expressions to be IMMUTABLE. array_to_string
-- is STABLE in PostgreSQL 17, so compute the weighted search vector in a trigger
-- instead of a generated column. This preserves title/keyword/abstract weighting.
create or replace function public.refresh_paper_search_document()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  new.search_document :=
    setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(array_to_string(new.keywords, ' '), '')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.abstract, '')), 'C');
  return new;
end;
$$;

create trigger papers_search_document_trigger
before insert or update of title, abstract, keywords
on public.papers
for each row execute function public.refresh_paper_search_document();

revoke all on function public.refresh_paper_search_document() from public, anon, authenticated;
grant execute on function public.refresh_paper_search_document() to service_role;

-- The public schema is exposed by Supabase's Data API. Keep these backend-only
-- tables inaccessible to anon/authenticated roles and use a server secret key.
alter table public.conference_sources enable row level security;
alter table public.crawl_runs enable row level security;
alter table public.papers enable row level security;

revoke all on table public.conference_sources from anon, authenticated;
revoke all on table public.crawl_runs from anon, authenticated;
revoke all on table public.papers from anon, authenticated;

grant all on table public.conference_sources to service_role;
grant all on table public.crawl_runs to service_role;
grant all on table public.papers to service_role;

create index if not exists papers_search_document_idx
  on public.papers using gin (search_document);

create index if not exists papers_embedding_hnsw_idx
  on public.papers using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

create index if not exists papers_conference_idx
  on public.papers (conference_slug, conference_year);

create index if not exists papers_source_url_idx
  on public.papers (source_url);

create or replace function public.hybrid_search_papers(
  query_text text,
  query_embedding extensions.vector(512),
  match_count integer default 12,
  full_text_weight double precision default 1.0,
  semantic_weight double precision default 1.0,
  rrf_k integer default 50
)
returns table (
  id uuid,
  source_record_id text,
  conference_slug text,
  conference_name text,
  conference_year integer,
  title text,
  abstract text,
  authors jsonb,
  division text,
  session_title text,
  session_type text,
  source_url text,
  retrieved_at timestamptz,
  raw_hash text,
  keywords text[],
  score double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with full_text as (
    select
      p.id,
      row_number() over (
        order by ts_rank_cd(p.search_document, websearch_to_tsquery('english', query_text)) desc
      ) as rank_ix
    from public.papers p
    where p.search_document @@ websearch_to_tsquery('english', query_text)
    order by ts_rank_cd(p.search_document, websearch_to_tsquery('english', query_text)) desc
    limit greatest(least(match_count * 4, 120), 20)
  ),
  semantic as (
    select
      p.id,
      row_number() over (order by p.embedding <=> query_embedding) as rank_ix
    from public.papers p
    where p.embedding is not null
    order by p.embedding <=> query_embedding
    limit greatest(least(match_count * 4, 120), 20)
  ),
  fused as (
    select
      coalesce(full_text.id, semantic.id) as id,
      coalesce(1.0 / (rrf_k + full_text.rank_ix), 0.0) * full_text_weight +
      coalesce(1.0 / (rrf_k + semantic.rank_ix), 0.0) * semantic_weight as score
    from full_text
    full outer join semantic using (id)
  )
  select
    p.id,
    p.source_record_id,
    p.conference_slug,
    p.conference_name,
    p.conference_year,
    p.title,
    p.abstract,
    p.authors,
    p.division,
    p.session_title,
    p.session_type,
    p.source_url,
    p.retrieved_at,
    p.raw_hash,
    p.keywords,
    fused.score
  from fused
  join public.papers p on p.id = fused.id
  order by fused.score desc
  limit least(greatest(match_count, 1), 30);
$$;

revoke all on function public.hybrid_search_papers(text, extensions.vector, integer, double precision, double precision, integer) from public, anon, authenticated;
grant execute on function public.hybrid_search_papers(text, extensions.vector, integer, double precision, double precision, integer) to service_role;