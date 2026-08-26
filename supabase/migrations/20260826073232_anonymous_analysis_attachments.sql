-- Anonymous preview identity and transient analysis attachment text.
-- All rows remain service-only; public APIs are mediated by Edge Functions.

create table if not exists private.analysis_attachments (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_key text not null check (
    owner_key ~ '^[0-9a-f]{64}$'
    or owner_key ~ '^user:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  file_name text not null check (
    char_length(file_name) between 1 and 255
    and file_name !~ '[/\\]'
    and file_name not in ('.', '..')
  ),
  kind text not null check (kind in ('pdf', 'markdown', 'text')),
  extracted_text text not null check (char_length(extracted_text) between 20 and 120000),
  character_count integer not null check (character_count between 20 and 120000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 hour'),
  consumed_at timestamptz,
  check (character_count = char_length(extracted_text)),
  check (expires_at > created_at)
);

create index if not exists analysis_attachments_owner_active_idx
  on private.analysis_attachments (owner_key, expires_at)
  where consumed_at is null;

create table if not exists private.anonymous_analysis_trials (
  owner_key text primary key check (owner_key ~ '^[0-9a-f]{64}$'),
  client_request_id uuid not null,
  status text not null check (status in ('reserved', 'completed')),
  reserved_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((status = 'completed') = (completed_at is not null))
);

alter table private.analysis_attachments enable row level security;
alter table private.anonymous_analysis_trials enable row level security;
revoke all on private.analysis_attachments, private.anonymous_analysis_trials from public, anon, authenticated;
grant select, insert, update, delete on private.analysis_attachments, private.anonymous_analysis_trials to service_role;

create or replace function public.store_analysis_attachment(
  target_owner_key text,
  target_max_attachments integer,
  target_file_name text,
  target_kind text,
  target_extracted_text text
)
returns table (attachment_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  active_count integer;
  created_id uuid;
  created_expiry timestamptz;
begin
  if target_owner_key is null or not (
    target_owner_key ~ '^[0-9a-f]{64}$'
    or target_owner_key ~ '^user:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) then raise exception 'invalid owner key' using errcode = '22023'; end if;
  if target_max_attachments not in (1, 3) then raise exception 'invalid attachment limit' using errcode = '22023'; end if;
  if target_file_name is null or char_length(target_file_name) not between 1 and 255
    or target_file_name ~ '[/\\]' or target_file_name in ('.', '..') then
    raise exception 'invalid file name' using errcode = '22023';
  end if;
  if target_kind not in ('pdf', 'markdown', 'text') then raise exception 'invalid attachment kind' using errcode = '22023'; end if;
  if target_extracted_text is null or char_length(target_extracted_text) not between 20 and 120000 then
    raise exception 'invalid attachment text' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_owner_key, 181));
  delete from private.analysis_attachments where expires_at <= now() or consumed_at < now() - interval '1 hour';
  select count(*)::integer into active_count
  from private.analysis_attachments a
  where a.owner_key = target_owner_key and a.consumed_at is null and a.expires_at > now();
  if active_count >= target_max_attachments then raise exception 'attachment limit reached' using errcode = 'P0001'; end if;

  insert into private.analysis_attachments(owner_key, file_name, kind, extracted_text, character_count)
  values (target_owner_key, target_file_name, target_kind, target_extracted_text, char_length(target_extracted_text))
  returning id, private.analysis_attachments.expires_at into created_id, created_expiry;
  return query select created_id, created_expiry;
end;
$$;

create or replace function public.get_analysis_attachments(target_owner_key text, target_attachment_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  result jsonb;
  expected integer;
begin
  expected := coalesce(cardinality(target_attachment_ids), 0);
  if expected = 0 then return '[]'::jsonb; end if;
  if expected > 3 or expected <> (select count(distinct value) from unnest(target_attachment_ids) as value) then
    raise exception 'invalid attachments' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'attachmentId', a.id,
    'name', a.file_name,
    'kind', a.kind,
    'text', a.extracted_text
  ) order by a.created_at), '[]'::jsonb)
  into result
  from private.analysis_attachments a
  where a.owner_key = target_owner_key
    and a.id = any(target_attachment_ids)
    and a.consumed_at is null
    and a.expires_at > now();
  if jsonb_array_length(result) <> expected then raise exception 'attachment not found' using errcode = '22023'; end if;
  return result;
end;
$$;

create or replace function public.consume_analysis_attachments(target_owner_key text, target_attachment_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare affected integer;
begin
  if coalesce(cardinality(target_attachment_ids), 0) = 0 then return 0; end if;
  update private.analysis_attachments
  set consumed_at = now(), extracted_text = repeat('x', character_count)
  where owner_key = target_owner_key
    and id = any(target_attachment_ids)
    and consumed_at is null
    and expires_at > now();
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.authorize_anonymous_analysis(target_owner_key text, target_client_request_id uuid)
returns table (allowed boolean, error_code text, retry_after_seconds integer)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare existing private.anonymous_analysis_trials%rowtype;
begin
  if target_owner_key is null or target_owner_key !~ '^[0-9a-f]{64}$' or target_client_request_id is null then
    raise exception 'invalid anonymous request' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_owner_key, 211));
  select * into existing from private.anonymous_analysis_trials where owner_key = target_owner_key;
  if existing.owner_key is null then
    insert into private.anonymous_analysis_trials(owner_key, client_request_id, status)
    values (target_owner_key, target_client_request_id, 'reserved');
    return query select true, null::text, 0;
    return;
  end if;
  if existing.status = 'reserved' and existing.client_request_id = target_client_request_id then
    return query select true, null::text, 0;
    return;
  end if;
  if existing.status = 'reserved' and existing.reserved_at < now() - interval '15 minutes' then
    update private.anonymous_analysis_trials
    set client_request_id = target_client_request_id, reserved_at = now()
    where owner_key = target_owner_key;
    return query select true, null::text, 0;
    return;
  end if;
  return query select false, 'ANONYMOUS_PREVIEW_USED'::text, 0;
end;
$$;

create or replace function public.complete_anonymous_analysis(target_owner_key text, target_client_request_id uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  update private.anonymous_analysis_trials
  set status = 'completed', completed_at = now()
  where owner_key = target_owner_key and client_request_id = target_client_request_id and status = 'reserved'
  returning true;
$$;

create or replace function public.release_anonymous_analysis(target_owner_key text, target_client_request_id uuid)
returns boolean
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  delete from private.anonymous_analysis_trials
  where owner_key = target_owner_key and client_request_id = target_client_request_id and status = 'reserved'
  returning true;
$$;

revoke all on function public.store_analysis_attachment(text, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.get_analysis_attachments(text, uuid[]) from public, anon, authenticated;
revoke all on function public.consume_analysis_attachments(text, uuid[]) from public, anon, authenticated;
revoke all on function public.authorize_anonymous_analysis(text, uuid) from public, anon, authenticated;
revoke all on function public.complete_anonymous_analysis(text, uuid) from public, anon, authenticated;
revoke all on function public.release_anonymous_analysis(text, uuid) from public, anon, authenticated;
grant execute on function public.store_analysis_attachment(text, integer, text, text, text) to service_role;
grant execute on function public.get_analysis_attachments(text, uuid[]) to service_role;
grant execute on function public.consume_analysis_attachments(text, uuid[]) to service_role;
grant execute on function public.authorize_anonymous_analysis(text, uuid) to service_role;
grant execute on function public.complete_anonymous_analysis(text, uuid) to service_role;
grant execute on function public.release_anonymous_analysis(text, uuid) to service_role;
