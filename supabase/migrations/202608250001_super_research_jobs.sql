create table if not exists private.super_usage_monthly (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_month date not null,
  request_count integer not null default 0 check (request_count >= 0 and request_count <= 5),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_month),
  check (usage_month = date_trunc('month', usage_month)::date)
);

create table if not exists private.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_request_id uuid not null,
  model_key text not null check (model_key in ('default', 'super_apodex')),
  match_count integer not null check (match_count in (10, 20, 100)),
  status text not null check (status in ('authorized', 'queued', 'researching', 'completed', 'failed')),
  provider_response_id text check (
    provider_response_id is null
    or (char_length(provider_response_id) between 1 and 200 and provider_response_id !~ '[[:cntrl:]]')
  ),
  idea text not null check (char_length(idea) between 20 and 5000),
  retrieved_papers jsonb not null default '[]'::jsonb check (jsonb_typeof(retrieved_papers) = 'array'),
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  error_code text check (error_code is null or error_code ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, client_request_id)
);

create index if not exists analysis_jobs_user_updated_idx
  on private.analysis_jobs (user_id, updated_at desc);
create unique index if not exists analysis_jobs_provider_response_idx
  on private.analysis_jobs (provider_response_id)
  where provider_response_id is not null;

alter table private.super_usage_monthly enable row level security;
alter table private.analysis_jobs enable row level security;

revoke all on private.super_usage_monthly, private.analysis_jobs from public, anon, authenticated;
grant select, insert, update, delete on private.super_usage_monthly, private.analysis_jobs to service_role;

drop function if exists public.get_analysis_entitlement_status(uuid);
create function public.get_analysis_entitlement_status(target_user_id uuid)
returns table (
  plan text,
  remaining integer,
  subscription_status text,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  super_remaining integer,
  super_monthly_limit integer
)
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  with entitlement as (
    select
      s.status,
      s.current_period_end,
      s.cancel_at_period_end,
      s.status in ('active', 'trialing')
        and (s.current_period_end is null or s.current_period_end > now()) as is_pro
    from private.subscriptions s
    where s.user_id = target_user_id
  ), daily_usage as (
    select coalesce(max(u.request_count), 0) as used
    from private.analysis_usage_daily u
    where u.user_id = target_user_id
      and u.usage_date = timezone('utc', now())::date
  ), monthly_usage as (
    select coalesce(max(u.request_count), 0) as used
    from private.super_usage_monthly u
    where u.user_id = target_user_id
      and u.usage_month = date_trunc('month', timezone('utc', now()))::date
  )
  select
    case when coalesce(e.is_pro, false) then 'pro' else 'free' end,
    case when coalesce(e.is_pro, false) then null else greatest(0, 1 - d.used) end,
    coalesce(e.status, 'none'),
    e.current_period_end,
    coalesce(e.cancel_at_period_end, false),
    case when coalesce(e.is_pro, false) then greatest(0, 5 - coalesce(m.used, 0)) else 0 end,
    case when coalesce(e.is_pro, false) then 5 else 0 end
  from daily_usage d
  cross join monthly_usage m
  left join entitlement e on true;
$$;

create or replace function public.authorize_analysis_request(
  target_user_id uuid,
  target_model_key text,
  target_match_count integer,
  target_client_request_id uuid,
  target_idea text
)
returns table (
  allowed boolean,
  error_code text,
  plan text,
  model_key text,
  match_count integer,
  job_id uuid,
  remaining integer,
  super_remaining integer,
  super_monthly_limit integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  today_utc date := timezone('utc', now())::date;
  month_utc date := date_trunc('month', timezone('utc', now()))::date;
  requested_model text := coalesce(nullif(trim(target_model_key), ''), 'default');
  requested_match_count integer := target_match_count;
  is_pro boolean := false;
  plan_name text := 'free';
  daily_used integer := 0;
  super_used integer := 0;
  existing_job private.analysis_jobs%rowtype;
  created_job_id uuid;
begin
  if target_user_id is null or target_client_request_id is null then
    raise exception 'missing analysis owner or request id' using errcode = '22023';
  end if;
  if target_idea is null or char_length(trim(target_idea)) not between 20 and 5000 then
    return query select false, 'INVALID_IDEA'::text, plan_name, requested_model,
      coalesce(requested_match_count, 10), null::uuid, 0, 0, 0, 0;
    return;
  end if;
  if requested_model not in ('default', 'super_apodex') then
    return query select false, 'INVALID_ANALYSIS_OPTIONS'::text, plan_name, requested_model,
      coalesce(requested_match_count, 10), null::uuid, 0, 0, 0, 0;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 73));

  select exists(
    select 1
    from private.subscriptions s
    where s.user_id = target_user_id
      and s.status in ('active', 'trialing')
      and (s.current_period_end is null or s.current_period_end > now())
  ) into is_pro;
  if is_pro then plan_name := 'pro'; end if;

  select j.* into existing_job
  from private.analysis_jobs j
  where j.user_id = target_user_id
    and j.client_request_id = target_client_request_id;

  select coalesce(max(u.request_count), 0) into daily_used
  from private.analysis_usage_daily u
  where u.user_id = target_user_id and u.usage_date = today_utc;

  select coalesce(max(u.request_count), 0) into super_used
  from private.super_usage_monthly u
  where u.user_id = target_user_id and u.usage_month = month_utc;

  if existing_job.id is not null then
    return query select true, null::text, plan_name, existing_job.model_key,
      existing_job.match_count, existing_job.id,
      case when is_pro then null else greatest(0, 1 - daily_used) end,
      case when is_pro then greatest(0, 5 - super_used) else 0 end,
      case when is_pro then 5 else 0 end,
      0;
    return;
  end if;

  if not is_pro then
    if requested_model = 'super_apodex' then
      return query select false, 'PRO_REQUIRED'::text, plan_name, requested_model,
        coalesce(requested_match_count, 10), null::uuid, greatest(0, 1 - daily_used), 0, 0, 0;
      return;
    end if;
    requested_match_count := 10;
    if daily_used >= 1 then
      return query select false, 'DAILY_LIMIT_REACHED'::text, plan_name, requested_model,
        requested_match_count, null::uuid, 0, 0, 0,
        greatest(1, ceil(extract(epoch from (
          ((today_utc + 1)::timestamp at time zone 'UTC') - clock_timestamp()
        )))::integer);
      return;
    end if;
  else
    requested_match_count := coalesce(requested_match_count, 20);
    if requested_match_count not in (20, 100) then
      return query select false, 'INVALID_ANALYSIS_OPTIONS'::text, plan_name, requested_model,
        requested_match_count, null::uuid, null::integer, greatest(0, 5 - super_used), 5, 0;
      return;
    end if;
    if requested_model = 'super_apodex' and super_used >= 5 then
      return query select false, 'SUPER_LIMIT_REACHED'::text, plan_name, requested_model,
        requested_match_count, null::uuid, null::integer, 0, 5, 0;
      return;
    end if;
  end if;

  if not is_pro then
    insert into private.analysis_usage_daily(user_id, usage_date, request_count)
    values (target_user_id, today_utc, 1)
    on conflict (user_id, usage_date) do update
      set request_count = private.analysis_usage_daily.request_count + 1,
          updated_at = now();
    daily_used := daily_used + 1;
  elsif requested_model = 'super_apodex' then
    insert into private.super_usage_monthly(user_id, usage_month, request_count)
    values (target_user_id, month_utc, 1)
    on conflict (user_id, usage_month) do update
      set request_count = private.super_usage_monthly.request_count + 1,
          updated_at = now();
    super_used := super_used + 1;
  end if;

  insert into private.analysis_jobs(
    user_id, client_request_id, model_key, match_count, status, idea
  ) values (
    target_user_id,
    target_client_request_id,
    requested_model,
    requested_match_count,
    case when requested_model = 'super_apodex' then 'queued' else 'authorized' end,
    trim(target_idea)
  ) returning id into created_job_id;

  return query select true, null::text, plan_name, requested_model,
    requested_match_count, created_job_id,
    case when is_pro then null else greatest(0, 1 - daily_used) end,
    case when is_pro then greatest(0, 5 - super_used) else 0 end,
    case when is_pro then 5 else 0 end,
    0;
end;
$$;

create or replace function public.get_analysis_job(target_user_id uuid, target_job_id uuid)
returns table (
  id uuid,
  model_key text,
  match_count integer,
  status text,
  provider_response_id text,
  idea text,
  retrieved_papers jsonb,
  result jsonb,
  error_code text,
  created_at timestamptz,
  updated_at timestamptz,
  completed_at timestamptz
)
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  select j.id, j.model_key, j.match_count, j.status, j.provider_response_id,
    j.idea, j.retrieved_papers, j.result, j.error_code,
    j.created_at, j.updated_at, j.completed_at
  from private.analysis_jobs j
  where j.user_id = target_user_id and j.id = target_job_id;
$$;

create or replace function public.set_analysis_job_context(
  target_user_id uuid,
  target_job_id uuid,
  target_retrieved_papers jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if jsonb_typeof(target_retrieved_papers) <> 'array'
    or jsonb_array_length(target_retrieved_papers) > 100 then
    raise exception 'invalid retrieved papers' using errcode = '22023';
  end if;
  update private.analysis_jobs j
  set retrieved_papers = target_retrieved_papers,
      updated_at = now()
  where j.user_id = target_user_id and j.id = target_job_id
    and j.status in ('authorized', 'queued', 'failed');
  return found;
end;
$$;

create or replace function public.set_analysis_job_provider(
  target_user_id uuid,
  target_job_id uuid,
  target_provider_response_id text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if target_provider_response_id is null
    or char_length(target_provider_response_id) not between 1 and 200
    or target_provider_response_id ~ '[[:cntrl:]]' then
    raise exception 'invalid provider response id' using errcode = '22023';
  end if;
  update private.analysis_jobs j
  set provider_response_id = target_provider_response_id,
      status = 'researching',
      error_code = null,
      updated_at = now()
  where j.user_id = target_user_id and j.id = target_job_id
    and j.model_key = 'super_apodex'
    and j.status in ('queued', 'failed');
  return found;
end;
$$;

create or replace function public.complete_analysis_job(
  target_user_id uuid,
  target_job_id uuid,
  target_result jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if jsonb_typeof(target_result) <> 'object' then
    raise exception 'invalid analysis result' using errcode = '22023';
  end if;
  update private.analysis_jobs j
  set result = target_result,
      status = 'completed',
      error_code = null,
      updated_at = now(),
      completed_at = now()
  where j.user_id = target_user_id and j.id = target_job_id
    and j.status in ('authorized', 'queued', 'researching');
  return found;
end;
$$;

create or replace function public.fail_analysis_job(
  target_user_id uuid,
  target_job_id uuid,
  target_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if target_error_code is null or target_error_code !~ '^[A-Z][A-Z0-9_]{1,63}$' then
    raise exception 'invalid analysis error code' using errcode = '22023';
  end if;
  update private.analysis_jobs j
  set status = 'failed',
      error_code = target_error_code,
      updated_at = now()
  where j.user_id = target_user_id and j.id = target_job_id
    and j.status <> 'completed';
  return found;
end;
$$;

revoke all on function public.get_analysis_entitlement_status(uuid),
  public.authorize_analysis_request(uuid, text, integer, uuid, text),
  public.get_analysis_job(uuid, uuid),
  public.set_analysis_job_context(uuid, uuid, jsonb),
  public.set_analysis_job_provider(uuid, uuid, text),
  public.complete_analysis_job(uuid, uuid, jsonb),
  public.fail_analysis_job(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.get_analysis_entitlement_status(uuid),
  public.authorize_analysis_request(uuid, text, integer, uuid, text),
  public.get_analysis_job(uuid, uuid),
  public.set_analysis_job_context(uuid, uuid, jsonb),
  public.set_analysis_job_provider(uuid, uuid, text),
  public.complete_analysis_job(uuid, uuid, jsonb),
  public.fail_analysis_job(uuid, uuid, text)
  to service_role;

alter table private.subscriptions
  add column if not exists stripe_promotion_code_id text
    check (stripe_promotion_code_id is null or stripe_promotion_code_id ~ '^promo_[A-Za-z0-9]+$'),
  add column if not exists stripe_coupon_id text
    check (stripe_coupon_id is null or stripe_coupon_id ~ '^[A-Za-z0-9_-]{1,255}$');

drop function if exists public.process_stripe_billing_event(
  text, text, bigint, text, text, text, text, uuid, bigint, boolean
);

create function public.process_stripe_billing_event(
  target_event_id text,
  target_event_type text,
  target_event_created bigint,
  target_customer_id text,
  target_subscription_id text,
  target_price_id text,
  target_status text,
  target_user_id uuid,
  target_period_end bigint,
  target_cancel_at_period_end boolean,
  target_promotion_code_id text default null,
  target_coupon_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  resolved_user_id uuid := target_user_id;
  resolved_status text := case
    when target_event_type = 'customer.subscription.deleted' then 'canceled'
    else target_status
  end;
begin
  if target_event_id !~ '^evt_[A-Za-z0-9]+$'
    or target_customer_id !~ '^cus_[A-Za-z0-9]+$' then
    raise exception 'invalid stripe event' using errcode = '22023';
  end if;
  if resolved_status not in (
    'incomplete', 'incomplete_expired', 'trialing', 'active',
    'past_due', 'canceled', 'unpaid', 'paused'
  ) then
    raise exception 'invalid subscription status' using errcode = '22023';
  end if;
  if target_promotion_code_id is not null
    and target_promotion_code_id !~ '^promo_[A-Za-z0-9]+$' then
    raise exception 'invalid promotion code id' using errcode = '22023';
  end if;
  if target_coupon_id is not null
    and target_coupon_id !~ '^[A-Za-z0-9_-]{1,255}$' then
    raise exception 'invalid coupon id' using errcode = '22023';
  end if;
  if exists (
    select 1 from private.stripe_webhook_events e where e.event_id = target_event_id
  ) then
    return false;
  end if;
  if resolved_user_id is null then
    select c.user_id into resolved_user_id
    from private.billing_customers c
    where c.stripe_customer_id = target_customer_id;
  end if;
  if resolved_user_id is null then
    raise exception 'unknown stripe customer';
  end if;

  insert into private.billing_customers(user_id, stripe_customer_id)
  values (resolved_user_id, target_customer_id)
  on conflict (user_id) do update
    set stripe_customer_id = excluded.stripe_customer_id,
        updated_at = now();

  if target_subscription_id is not null and target_subscription_id <> '' then
    if target_subscription_id !~ '^sub_[A-Za-z0-9]+$' then
      raise exception 'invalid subscription id' using errcode = '22023';
    end if;
    insert into private.subscriptions(
      user_id,
      stripe_customer_id,
      stripe_subscription_id,
      stripe_price_id,
      status,
      current_period_end,
      cancel_at_period_end,
      stripe_promotion_code_id,
      stripe_coupon_id
    ) values (
      resolved_user_id,
      target_customer_id,
      target_subscription_id,
      nullif(target_price_id, ''),
      resolved_status,
      case when target_period_end > 0 then to_timestamp(target_period_end) else null end,
      coalesce(target_cancel_at_period_end, false),
      target_promotion_code_id,
      target_coupon_id
    )
    on conflict (user_id) do update
      set stripe_customer_id = excluded.stripe_customer_id,
          stripe_subscription_id = excluded.stripe_subscription_id,
          stripe_price_id = excluded.stripe_price_id,
          status = excluded.status,
          current_period_end = excluded.current_period_end,
          cancel_at_period_end = excluded.cancel_at_period_end,
          stripe_promotion_code_id = excluded.stripe_promotion_code_id,
          stripe_coupon_id = excluded.stripe_coupon_id,
          updated_at = now();
  end if;

  insert into private.stripe_webhook_events(event_id, event_type, event_created_at)
  values (target_event_id, target_event_type, to_timestamp(target_event_created));
  return true;
end;
$$;

revoke all on function public.process_stripe_billing_event(
  text, text, bigint, text, text, text, text, uuid, bigint, boolean, text, text
) from public, anon, authenticated;
grant execute on function public.process_stripe_billing_event(
  text, text, bigint, text, text, text, text, uuid, bigint, boolean, text, text
) to service_role;
