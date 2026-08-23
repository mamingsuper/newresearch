-- Repair the already-deployed beta rate limiter after Postgres reported an
-- ambiguous client_hash reference in the original ON CONFLICT column target.

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
  on conflict on constraint beta_rate_limit_buckets_pkey
  do update set request_count = b.request_count + 1, updated_at = now();

  allowed := true;
  retry_after_seconds := 0;
  return next;
end;
$$;

revoke all on function public.consume_beta_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_beta_rate_limit(text) to service_role;
