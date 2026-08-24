create table if not exists private.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique check (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  status text not null default 'incomplete' check (status in ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.analysis_usage_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

create table if not exists private.stripe_webhook_events (
  event_id text primary key check (event_id ~ '^evt_[A-Za-z0-9]+$'),
  event_type text not null,
  event_created_at timestamptz not null,
  processed_at timestamptz not null default now()
);

alter table private.billing_customers enable row level security;
alter table private.subscriptions enable row level security;
alter table private.analysis_usage_daily enable row level security;
alter table private.stripe_webhook_events enable row level security;
revoke all on private.billing_customers, private.subscriptions, private.analysis_usage_daily, private.stripe_webhook_events from public, anon, authenticated;
grant select, insert, update, delete on private.billing_customers, private.subscriptions, private.analysis_usage_daily, private.stripe_webhook_events to service_role;

create or replace function public.get_billing_context(target_user_id uuid)
returns table (stripe_customer_id text, stripe_subscription_id text, subscription_status text)
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  select c.stripe_customer_id, s.stripe_subscription_id, s.status
  from (select target_user_id as user_id) u
  left join private.billing_customers c using (user_id)
  left join private.subscriptions s using (user_id);
$$;

create or replace function public.upsert_stripe_customer(target_user_id uuid, target_customer_id text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if target_customer_id !~ '^cus_[A-Za-z0-9]+$' then raise exception 'invalid customer id' using errcode = '22023'; end if;
  insert into private.billing_customers(user_id, stripe_customer_id)
  values (target_user_id, target_customer_id)
  on conflict (user_id) do update set stripe_customer_id = excluded.stripe_customer_id, updated_at = now();
end;
$$;

create or replace function public.get_analysis_entitlement_status(target_user_id uuid)
returns table (plan text, remaining integer, subscription_status text, current_period_end timestamptz, cancel_at_period_end boolean)
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  with entitlement as (
    select s.status, s.current_period_end, s.cancel_at_period_end,
      s.status in ('active','trialing') and (s.current_period_end is null or s.current_period_end > now()) as is_pro
    from private.subscriptions s where s.user_id = target_user_id
  ), usage as (
    select coalesce(max(u.request_count), 0) as used
    from private.analysis_usage_daily u
    where u.user_id = target_user_id and u.usage_date = timezone('utc', now())::date
  )
  select case when coalesce(e.is_pro, false) then 'pro' else 'free' end,
    case when coalesce(e.is_pro, false) then null else greatest(0, 1 - usage.used) end,
    coalesce(e.status, 'none'), e.current_period_end, coalesce(e.cancel_at_period_end, false)
  from usage left join entitlement e on true;
$$;

create or replace function public.consume_analysis_entitlement(target_user_id uuid)
returns table (allowed boolean, plan text, remaining integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  today_utc date := timezone('utc', now())::date;
  used integer := 0;
  pro_enabled boolean := false;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 41));
  select exists(
    select 1 from private.subscriptions s
    where s.user_id = target_user_id and s.status in ('active','trialing')
      and (s.current_period_end is null or s.current_period_end > now())
  ) into pro_enabled;
  if pro_enabled then
    return query select true, 'pro'::text, null::integer, 0;
    return;
  end if;
  delete from private.analysis_usage_daily where usage_date < today_utc - 90;
  insert into private.analysis_usage_daily(user_id, usage_date, request_count)
  values (target_user_id, today_utc, 0) on conflict do nothing;
  select request_count into used from private.analysis_usage_daily
  where user_id = target_user_id and usage_date = today_utc for update;
  if used >= 1 then
    return query select false, 'free'::text, 0,
      greatest(1, ceil(extract(epoch from (((today_utc + 1)::timestamp at time zone 'UTC') - clock_timestamp())))::integer);
    return;
  end if;
  update private.analysis_usage_daily set request_count = request_count + 1, updated_at = now()
  where user_id = target_user_id and usage_date = today_utc;
  return query select true, 'free'::text, 0, 0;
end;
$$;

create or replace function public.process_stripe_billing_event(
  target_event_id text, target_event_type text, target_event_created bigint,
  target_customer_id text, target_subscription_id text, target_price_id text,
  target_status text, target_user_id uuid, target_period_end bigint,
  target_cancel_at_period_end boolean
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare resolved_user_id uuid := target_user_id;
begin
  if target_event_id !~ '^evt_[A-Za-z0-9]+$' or target_customer_id !~ '^cus_[A-Za-z0-9]+$' then
    raise exception 'invalid stripe event' using errcode = '22023';
  end if;
  if exists(select 1 from private.stripe_webhook_events where event_id = target_event_id) then return false; end if;
  if resolved_user_id is null then
    select user_id into resolved_user_id from private.billing_customers where stripe_customer_id = target_customer_id;
  end if;
  if resolved_user_id is null then raise exception 'unknown stripe customer'; end if;
  insert into private.billing_customers(user_id, stripe_customer_id) values (resolved_user_id, target_customer_id)
  on conflict (user_id) do update set stripe_customer_id = excluded.stripe_customer_id, updated_at = now();
  if target_subscription_id is not null and target_subscription_id <> '' then
    insert into private.subscriptions(user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, status, current_period_end, cancel_at_period_end)
    values (resolved_user_id, target_customer_id, target_subscription_id, nullif(target_price_id,''),
      case when target_event_type = 'customer.subscription.deleted' then 'canceled' else target_status end,
      case when target_period_end > 0 then to_timestamp(target_period_end) else null end, coalesce(target_cancel_at_period_end,false))
    on conflict (user_id) do update set stripe_customer_id = excluded.stripe_customer_id,
      stripe_subscription_id = excluded.stripe_subscription_id, stripe_price_id = excluded.stripe_price_id,
      status = excluded.status, current_period_end = excluded.current_period_end,
      cancel_at_period_end = excluded.cancel_at_period_end, updated_at = now();
  end if;
  insert into private.stripe_webhook_events(event_id,event_type,event_created_at)
  values (target_event_id,target_event_type,to_timestamp(target_event_created));
  return true;
end;
$$;

revoke all on function public.get_billing_context(uuid), public.upsert_stripe_customer(uuid,text),
  public.get_analysis_entitlement_status(uuid), public.consume_analysis_entitlement(uuid),
  public.process_stripe_billing_event(text,text,bigint,text,text,text,text,uuid,bigint,boolean)
  from public, anon, authenticated;
grant execute on function public.get_billing_context(uuid), public.upsert_stripe_customer(uuid,text),
  public.get_analysis_entitlement_status(uuid), public.consume_analysis_entitlement(uuid),
  public.process_stripe_billing_event(text,text,bigint,text,text,text,text,uuid,bigint,boolean)
  to service_role;
