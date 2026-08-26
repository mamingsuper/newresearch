create table if not exists private.pending_billing_claims (
  email_hash text primary key check (email_hash ~ '^[0-9a-f]{64}$'),
  stripe_customer_id text not null unique check (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  stripe_subscription_id text unique check (stripe_subscription_id is null or stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  stripe_price_id text,
  status text not null check (status in ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  stripe_promotion_code_id text,
  stripe_coupon_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.pending_billing_claims enable row level security;
revoke all on table private.pending_billing_claims from public, anon, authenticated;
grant select, insert, update, delete on table private.pending_billing_claims to service_role;

create or replace function public.process_guest_stripe_billing_event(
  target_event_id text,
  target_event_type text,
  target_event_created bigint,
  target_customer_id text,
  target_subscription_id text,
  target_price_id text,
  target_status text,
  target_user_id uuid,
  target_email_hash text,
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
  resolved_status text := case when target_event_type = 'customer.subscription.deleted' then 'canceled' else target_status end;
begin
  if target_event_id !~ '^evt_[A-Za-z0-9]+$'
    or target_customer_id !~ '^cus_[A-Za-z0-9]+$'
    or (target_email_hash is not null and target_email_hash !~ '^[0-9a-f]{64}$')
    or resolved_status not in ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused') then
    raise exception 'invalid stripe event' using errcode = '22023';
  end if;
  if exists (select 1 from private.stripe_webhook_events where event_id = target_event_id) then return false; end if;

  if resolved_user_id is null then
    select user_id into resolved_user_id from private.billing_customers where stripe_customer_id = target_customer_id;
  end if;

  if resolved_user_id is null then
    if target_email_hash is null then raise exception 'unknown stripe customer'; end if;
    insert into private.pending_billing_claims (
      email_hash, stripe_customer_id, stripe_subscription_id, stripe_price_id, status,
      current_period_end, cancel_at_period_end, stripe_promotion_code_id, stripe_coupon_id
    ) values (
      target_email_hash, target_customer_id, nullif(target_subscription_id, ''), nullif(target_price_id, ''), resolved_status,
      case when target_period_end > 0 then to_timestamp(target_period_end) else null end,
      coalesce(target_cancel_at_period_end, false), target_promotion_code_id, target_coupon_id
    ) on conflict (email_hash) do update set
      stripe_customer_id = excluded.stripe_customer_id,
      stripe_subscription_id = excluded.stripe_subscription_id,
      stripe_price_id = excluded.stripe_price_id,
      status = excluded.status,
      current_period_end = excluded.current_period_end,
      cancel_at_period_end = excluded.cancel_at_period_end,
      stripe_promotion_code_id = excluded.stripe_promotion_code_id,
      stripe_coupon_id = excluded.stripe_coupon_id,
      updated_at = now();
  else
    insert into private.billing_customers (user_id, stripe_customer_id)
    values (resolved_user_id, target_customer_id)
    on conflict (user_id) do update set stripe_customer_id = excluded.stripe_customer_id, updated_at = now();
    if nullif(target_subscription_id, '') is not null then
      insert into private.subscriptions (
        user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, status,
        current_period_end, cancel_at_period_end, stripe_promotion_code_id, stripe_coupon_id
      ) values (
        resolved_user_id, target_customer_id, target_subscription_id, nullif(target_price_id, ''), resolved_status,
        case when target_period_end > 0 then to_timestamp(target_period_end) else null end,
        coalesce(target_cancel_at_period_end, false), target_promotion_code_id, target_coupon_id
      ) on conflict (user_id) do update set
        stripe_customer_id = excluded.stripe_customer_id,
        stripe_subscription_id = excluded.stripe_subscription_id,
        stripe_price_id = excluded.stripe_price_id,
        status = excluded.status,
        current_period_end = excluded.current_period_end,
        cancel_at_period_end = excluded.cancel_at_period_end,
        stripe_promotion_code_id = excluded.stripe_promotion_code_id,
        stripe_coupon_id = excluded.stripe_coupon_id,
        updated_at = now();
    end if;
  end if;

  insert into private.stripe_webhook_events (event_id, event_type, event_created_at)
  values (target_event_id, target_event_type, to_timestamp(target_event_created));
  return true;
end;
$$;

create or replace function public.claim_pending_billing(target_user_id uuid, target_email_hash text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  pending private.pending_billing_claims;
begin
  if target_email_hash !~ '^[0-9a-f]{64}$' or not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'invalid billing claim' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_email_hash, 83));
  select * into pending from private.pending_billing_claims where email_hash = target_email_hash for update;
  if not found then return false; end if;

  insert into private.billing_customers (user_id, stripe_customer_id)
  values (target_user_id, pending.stripe_customer_id)
  on conflict (user_id) do update set stripe_customer_id = excluded.stripe_customer_id, updated_at = now();
  if pending.stripe_subscription_id is not null then
    insert into private.subscriptions (
      user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, status,
      current_period_end, cancel_at_period_end, stripe_promotion_code_id, stripe_coupon_id
    ) values (
      target_user_id, pending.stripe_customer_id, pending.stripe_subscription_id, pending.stripe_price_id,
      pending.status, pending.current_period_end, pending.cancel_at_period_end,
      pending.stripe_promotion_code_id, pending.stripe_coupon_id
    ) on conflict (user_id) do update set
      stripe_customer_id = excluded.stripe_customer_id,
      stripe_subscription_id = excluded.stripe_subscription_id,
      stripe_price_id = excluded.stripe_price_id,
      status = excluded.status,
      current_period_end = excluded.current_period_end,
      cancel_at_period_end = excluded.cancel_at_period_end,
      stripe_promotion_code_id = excluded.stripe_promotion_code_id,
      stripe_coupon_id = excluded.stripe_coupon_id,
      updated_at = now();
  end if;
  delete from private.pending_billing_claims where email_hash = target_email_hash;
  return true;
end;
$$;

revoke all on function public.process_guest_stripe_billing_event(
  text, text, bigint, text, text, text, text, uuid, text, bigint, boolean, text, text
), public.claim_pending_billing(uuid, text) from public, anon, authenticated;
grant execute on function public.process_guest_stripe_billing_event(
  text, text, bigint, text, text, text, text, uuid, text, bigint, boolean, text, text
), public.claim_pending_billing(uuid, text) to service_role;
