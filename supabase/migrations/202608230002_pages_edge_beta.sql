-- GitHub Pages + Supabase Edge public beta support.
-- Keep the production vector space on OpenAI text-embedding-3-small / 512d.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

-- Only unfinished work is retargeted. Completed paper vectors are intentionally untouched.
update public.embedding_jobs
set model = 'text-embedding-3-small',
    dimensions = 512,
    status = 'pending',
    attempts = 0,
    next_attempt_at = now(),
    lease_expires_at = null,
    last_error_code = null,
    completed_at = null,
    updated_at = now()
where status in ('pending', 'processing')
  and (model <> 'text-embedding-3-small' or dimensions <> 512);

create table if not exists private.beta_rate_limit_buckets (
  client_hash text not null,
  window_kind text not null check (window_kind in ('minute', 'hour')),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (client_hash, window_kind, window_started_at)
);

alter table private.beta_rate_limit_buckets enable row level security;
revoke all on table private.beta_rate_limit_buckets from public, anon, authenticated;
grant select, insert, update, delete on table private.beta_rate_limit_buckets to service_role;

create or replace function public.consume_beta_rate_limit(client_hash text)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  target_client_hash text := client_hash;
  minute_start timestamptz := date_trunc('minute', now());
  hour_start timestamptz := date_trunc('hour', now());
  minute_request_count integer := 0;
  hour_request_count integer := 0;
  minute_retry integer := 0;
  hour_retry integer := 0;
begin
  if target_client_hash is null or target_client_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid client hash' using errcode = '22023';
  end if;

  -- Serialize one anonymous client across both buckets so parallel calls cannot bypass limits.
  perform pg_advisory_xact_lock(hashtextextended(target_client_hash, 0));

  delete from private.beta_rate_limit_buckets
  where window_started_at < now() - interval '2 hours';

  select coalesce(max(b.request_count), 0)
  into minute_request_count
  from private.beta_rate_limit_buckets b
  where b.client_hash = target_client_hash
    and b.window_kind = 'minute'
    and b.window_started_at = minute_start;

  select coalesce(max(b.request_count), 0)
  into hour_request_count
  from private.beta_rate_limit_buckets b
  where b.client_hash = target_client_hash
    and b.window_kind = 'hour'
    and b.window_started_at = hour_start;

  if minute_request_count >= 5 then
    minute_retry := greatest(1, ceil(extract(epoch from (minute_start + interval '1 minute' - clock_timestamp())))::integer);
  end if;
  if hour_request_count >= 30 then
    hour_retry := greatest(1, ceil(extract(epoch from (hour_start + interval '1 hour' - clock_timestamp())))::integer);
  end if;

  if minute_retry > 0 or hour_retry > 0 then
    allowed := false;
    retry_after_seconds := greatest(minute_retry, hour_retry);
    return next;
    return;
  end if;

  insert into private.beta_rate_limit_buckets as b
    (client_hash, window_kind, window_started_at, request_count, updated_at)
  values
    (target_client_hash, 'minute', minute_start, 1, now()),
    (target_client_hash, 'hour', hour_start, 1, now())
  on conflict (client_hash, window_kind, window_started_at)
  do update set request_count = b.request_count + 1, updated_at = now();

  allowed := true;
  retry_after_seconds := 0;
  return next;
end;
$$;

revoke all on function public.consume_beta_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_beta_rate_limit(text) to service_role;
