-- Live-rollout hardening discovered while initializing the first Supabase project.

create index if not exists crawl_runs_conference_source_id_idx
  on public.crawl_runs (conference_source_id);

create index if not exists ingestion_rejections_ingestion_run_id_idx
  on public.ingestion_rejections (ingestion_run_id);

create index if not exists papers_conference_source_id_idx
  on public.papers (conference_source_id);

create index if not exists papers_last_ingestion_run_id_idx
  on public.papers (last_ingestion_run_id);

-- Supabase projects currently include this event-trigger function to enable RLS on
-- newly created public tables. Keep the event trigger operational while preventing
-- direct RPC execution by browser roles. The guard keeps this migration portable to
-- Postgres/Supabase environments where the helper is absent.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
    execute 'grant execute on function public.rls_auto_enable() to service_role';
  end if;
end;
$$;