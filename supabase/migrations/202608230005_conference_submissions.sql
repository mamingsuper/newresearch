-- Moderated conference-program submissions, review audit, and confirmed imports.
-- Review staging stays outside the exposed public schema.

create schema if not exists workspace_private;
revoke all on schema workspace_private from public, anon, authenticated, service_role;
grant usage on schema workspace_private to authenticated, service_role;

create table if not exists public.program_submissions (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  conference_slug text not null
    constraint program_submissions_slug_format
      check (conference_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(conference_slug) <= 100),
  conference_name text not null
    constraint program_submissions_name_length check (char_length(conference_name) between 1 and 200),
  conference_acronym text not null
    constraint program_submissions_acronym_length check (char_length(conference_acronym) between 1 and 32),
  conference_year integer not null
    constraint program_submissions_year_range check (conference_year between 1900 and 2100),
  discipline text not null
    constraint program_submissions_discipline_length check (char_length(discipline) between 1 and 100),
  official_conference_url text not null
    constraint program_submissions_official_url_length check (char_length(official_conference_url) between 9 and 2048)
    constraint program_submissions_official_url_https check (
      official_conference_url ~ '^https://[^/@[:space:]]+(?::[0-9]+)?(?:[/?#]|$)'
      and official_conference_url !~ '[[:space:]]'
    ),
  notes text not null default ''
    constraint program_submissions_notes_length check (char_length(notes) <= 4000),
  submission_kind text not null
    constraint program_submissions_kind check (submission_kind in ('url', 'file')),
  program_url text
    constraint program_submissions_program_url_length check (program_url is null or char_length(program_url) between 9 and 2048)
    constraint program_submissions_program_url_https check (
      program_url is null or (
        program_url ~ '^https://[^/@[:space:]]+(?::[0-9]+)?(?:[/?#]|$)'
        and program_url !~ '[[:space:]]'
      )
    ),
  storage_path text
    constraint program_submissions_storage_path_length check (storage_path is null or char_length(storage_path) between 3 and 512),
  rights_attested boolean not null,
  rights_attested_at timestamptz not null,
  file_name text
    constraint program_submissions_file_name_length check (file_name is null or char_length(file_name) between 1 and 255)
    constraint program_submissions_safe_file_name check (
      file_name is null or (
        file_name !~ '[/\\]'
        and file_name !~ '[[:cntrl:]]'
        and file_name not in ('.', '..')
      )
    ),
  file_size_bytes bigint
    constraint program_submissions_file_size check (file_size_bytes is null or file_size_bytes between 1 and 26214400),
  mime_type text
    constraint program_submissions_mime_type check (
      mime_type is null or mime_type in (
        'application/pdf',
        'text/csv',
        'application/json',
        'application/zip'
      )
    ),
  content_sha256 text
    constraint program_submissions_content_hash check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'submitted'
    constraint program_submissions_status check (
      status in ('submitted', 'under_review', 'approved', 'import_preview', 'imported', 'rejected')
    ),
  supersedes_submission_id uuid references public.program_submissions (id) on delete set null,
  review_reason text
    constraint program_submissions_review_reason_length check (review_reason is null or char_length(review_reason) between 1 and 4000),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz not null default now(),
  constraint program_submissions_rights_required check (rights_attested = true),
  constraint program_submissions_exact_source check (
    (
      submission_kind = 'url'
      and program_url is not null
      and storage_path is null
      and file_name is null
      and file_size_bytes is null
      and mime_type is null
      and content_sha256 is null
    )
    or
    (
      submission_kind = 'file'
      and program_url is null
      and storage_path is not null
      and file_name is not null
      and file_size_bytes is not null
      and mime_type is not null
      and content_sha256 is not null
    )
  ),
  constraint program_submissions_not_self_superseding check (supersedes_submission_id is null or supersedes_submission_id <> id)
);

create table if not exists public.conference_programs (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique
    constraint conference_programs_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) <= 100),
  conference_name text not null
    constraint conference_programs_name_length check (char_length(conference_name) between 1 and 200),
  conference_acronym text not null
    constraint conference_programs_acronym_length check (char_length(conference_acronym) between 1 and 32),
  conference_year integer not null
    constraint conference_programs_year_range check (conference_year between 1900 and 2100),
  discipline text not null
    constraint conference_programs_discipline_length check (char_length(discipline) between 1 and 100),
  official_conference_url text not null
    constraint conference_programs_official_url_length check (char_length(official_conference_url) between 9 and 2048),
  program_url text
    constraint conference_programs_program_url_length check (program_url is null or char_length(program_url) between 9 and 2048),
  source_submission_id uuid references public.program_submissions (id) on delete set null,
  coverage_status text not null
    constraint conference_programs_coverage check (coverage_status in ('program_only', 'indexed', 'partial', 'retired')),
  paper_count integer not null default 0
    constraint conference_programs_paper_count check (paper_count >= 0),
  provenance_note text not null default ''
    constraint conference_programs_provenance_length check (char_length(provenance_note) <= 4000),
  published_at timestamptz not null default now(),
  last_verified_at timestamptz not null default now()
);

create table if not exists workspace_private.submission_events (
  id bigint generated always as identity primary key,
  submission_id uuid not null references public.program_submissions (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  from_status text,
  to_status text not null,
  event_type text not null
    constraint submission_events_type_length check (char_length(event_type) between 1 and 64),
  detail jsonb not null default '{}'::jsonb
    constraint submission_events_detail_object check (jsonb_typeof(detail) = 'object')
    constraint submission_events_detail_size check (octet_length(detail::text) <= 8192),
  created_at timestamptz not null default now()
);

create table if not exists workspace_private.program_import_previews (
  submission_id uuid primary key references public.program_submissions (id) on delete cascade,
  preview_status text not null
    constraint program_import_previews_status check (preview_status in ('pending', 'valid', 'invalid', 'failed')),
  parser_name text not null
    constraint program_import_previews_parser_length check (char_length(parser_name) between 1 and 100),
  parser_version text not null
    constraint program_import_previews_version_length check (char_length(parser_version) between 1 and 64),
  source_sha256 text not null
    constraint program_import_previews_source_hash check (source_sha256 ~ '^[0-9a-f]{64}$'),
  record_count integer not null default 0
    constraint program_import_previews_record_count check (record_count >= 0),
  rejected_count integer not null default 0
    constraint program_import_previews_rejected_count check (rejected_count >= 0),
  safe_summary jsonb not null default '{}'::jsonb
    constraint program_import_previews_summary_object check (jsonb_typeof(safe_summary) = 'object')
    constraint program_import_previews_summary_size check (octet_length(safe_summary::text) <= 32768),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workspace_private.program_import_records (
  id bigint generated always as identity primary key,
  submission_id uuid not null references workspace_private.program_import_previews (submission_id) on delete cascade,
  record_index integer not null check (record_index >= 0),
  validation_status text not null check (validation_status in ('valid', 'rejected')),
  validation_errors jsonb not null default '[]'::jsonb
    constraint program_import_records_errors_array check (jsonb_typeof(validation_errors) = 'array')
    constraint program_import_records_errors_size check (octet_length(validation_errors::text) <= 8192),
  source_record_id text,
  title text,
  abstract text,
  authors jsonb,
  division text,
  session_title text,
  session_type text,
  keywords text[],
  source_url text,
  raw_hash text,
  embedding_input_hash text,
  created_at timestamptz not null default now(),
  constraint program_import_records_unique_index unique (submission_id, record_index),
  constraint program_import_records_valid_shape check (
    validation_status = 'rejected'
    or (
      source_record_id is not null and char_length(source_record_id) between 1 and 500
      and title is not null and char_length(title) between 1 and 1000
      and abstract is not null and char_length(abstract) between 1 and 20000
      and authors is not null and jsonb_typeof(authors) = 'array'
      and keywords is not null
      and source_url is not null and char_length(source_url) between 9 and 2048
      and raw_hash is not null and raw_hash ~ '^[0-9a-f]{64}$'
      and embedding_input_hash is not null and embedding_input_hash ~ '^[0-9a-f]{64}$'
    )
  )
);

create index if not exists program_submissions_owner_status_time_idx
  on public.program_submissions (user_id, status, submitted_at desc);
create index if not exists program_submissions_moderation_status_time_idx
  on public.program_submissions (status, submitted_at);
create index if not exists program_submissions_supersedes_idx
  on public.program_submissions (supersedes_submission_id);
create index if not exists program_submissions_program_url_duplicate_idx
  on public.program_submissions (program_url) where program_url is not null;
create index if not exists program_submissions_content_sha256_duplicate_idx
  on public.program_submissions (content_sha256) where content_sha256 is not null;
create index if not exists program_submissions_conference_identity_idx
  on public.program_submissions (conference_slug, conference_year);
create index if not exists conference_programs_status_time_idx
  on public.conference_programs (coverage_status, published_at desc);
create index if not exists conference_programs_source_submission_idx
  on public.conference_programs (source_submission_id);
create index if not exists submission_events_submission_time_idx
  on workspace_private.submission_events (submission_id, created_at);
create index if not exists submission_events_actor_idx
  on workspace_private.submission_events (actor_user_id);
create index if not exists program_import_previews_created_by_idx
  on workspace_private.program_import_previews (created_by);

alter table public.program_submissions enable row level security;
alter table public.conference_programs enable row level security;
alter table workspace_private.submission_events enable row level security;
alter table workspace_private.program_import_previews enable row level security;
alter table workspace_private.program_import_records enable row level security;

revoke all on table public.program_submissions from anon, authenticated;
revoke all on table public.conference_programs from anon, authenticated;
revoke all on table workspace_private.submission_events from public, anon, authenticated;
revoke all on table workspace_private.program_import_previews from public, anon, authenticated;
revoke all on table workspace_private.program_import_records from public, anon, authenticated;

grant select on table public.program_submissions to authenticated;
grant select on table public.conference_programs to anon, authenticated;
grant all on table public.program_submissions to service_role;
grant all on table public.conference_programs to service_role;
grant all on table workspace_private.submission_events to service_role;
grant all on table workspace_private.program_import_previews to service_role;
grant all on table workspace_private.program_import_records to service_role;
grant usage, select on all sequences in schema workspace_private to service_role;

drop policy if exists "program submissions owner select" on public.program_submissions;
create policy "program submissions owner select"
on public.program_submissions for select
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

drop policy if exists "program submissions admin select" on public.program_submissions;
create policy "program submissions admin select"
on public.program_submissions for select
to authenticated
using (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

drop policy if exists "published conference programs select" on public.conference_programs;
create policy "published conference programs select"
on public.conference_programs for select
to anon, authenticated
using (published_at is not null);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'program-submissions',
  'program-submissions',
  false,
  26214400,
  array['application/pdf', 'text/csv', 'application/json', 'application/zip']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "program submissions owner upload" on storage.objects;
create policy "program submissions owner upload"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'program-submissions'
  and (select auth.uid()) is not null
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and pg_catalog.array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and storage.filename(name) ~ '^[A-Za-z0-9][A-Za-z0-9._ -]{0,254}$'
  and storage.filename(name) not in ('.', '..')
);

drop policy if exists "program submissions owner read pending upload" on storage.objects;
create policy "program submissions owner read pending upload"
on storage.objects for select
to authenticated
using (
  bucket_id = 'program-submissions'
  and (select auth.uid()) is not null
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (
    select 1
    from public.program_submissions
    where program_submissions.storage_path = storage.objects.name
  )
);

drop policy if exists "program submissions owner delete pending upload" on storage.objects;
create policy "program submissions owner delete pending upload"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'program-submissions'
  and (select auth.uid()) is not null
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (
    select 1
    from public.program_submissions
    where program_submissions.storage_path = storage.objects.name
  )
);

create or replace function workspace_private.create_program_submission_impl(
  target_submission_id uuid,
  target_user_id uuid,
  target_conference_slug text,
  target_conference_name text,
  target_conference_acronym text,
  target_conference_year integer,
  target_discipline text,
  target_official_conference_url text,
  target_notes text,
  target_submission_kind text,
  target_program_url text,
  target_storage_path text,
  target_file_name text,
  target_file_size_bytes bigint,
  target_mime_type text,
  target_content_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_row public.program_submissions;
begin
  if not exists (select 1 from auth.users where id = target_user_id) then
    raise sqlstate '23503' using message = 'submission owner does not exist';
  end if;
  if target_submission_kind = 'file'
    and target_storage_path is distinct from (
      target_user_id::text || '/' || target_submission_id::text || '/' || target_file_name
    ) then
    raise sqlstate '22023' using message = 'storage path does not match submission owner';
  end if;
  if target_submission_kind = 'file' then
    perform 1
    from storage.objects
    where bucket_id = 'program-submissions'
      and name = target_storage_path
      and owner_id = target_user_id::text
      and (metadata ->> 'size')::bigint = target_file_size_bytes
      and lower(split_part(metadata ->> 'mimetype', ';', 1)) = target_mime_type
    for share;
    if not found then
      raise sqlstate '22023' using message = 'stored file metadata does not match submission';
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(coalesce(target_program_url, target_content_sha256), 0)
  );
  if exists (
    select 1
    from public.program_submissions
    where (target_program_url is not null and program_url = target_program_url)
      or (target_content_sha256 is not null and content_sha256 = target_content_sha256)
  ) then
    raise sqlstate '23505' using message = 'duplicate program submission';
  end if;

  insert into public.program_submissions (
    id,
    user_id,
    conference_slug,
    conference_name,
    conference_acronym,
    conference_year,
    discipline,
    official_conference_url,
    notes,
    submission_kind,
    program_url,
    storage_path,
    rights_attested,
    rights_attested_at,
    file_name,
    file_size_bytes,
    mime_type,
    content_sha256,
    status,
    submitted_at
  ) values (
    target_submission_id,
    target_user_id,
    target_conference_slug,
    target_conference_name,
    target_conference_acronym,
    target_conference_year,
    target_discipline,
    target_official_conference_url,
    target_notes,
    target_submission_kind,
    target_program_url,
    target_storage_path,
    true,
    now(),
    target_file_name,
    target_file_size_bytes,
    target_mime_type,
    target_content_sha256,
    'submitted',
    now()
  )
  returning * into created_row;

  insert into workspace_private.submission_events (
    submission_id,
    actor_user_id,
    from_status,
    to_status,
    event_type,
    detail
  ) values (
    created_row.id,
    target_user_id,
    null,
    'submitted',
    'submission_created',
    jsonb_build_object('submissionKind', target_submission_kind)
  );

  return jsonb_build_object(
    'id', created_row.id,
    'status', created_row.status,
    'submittedAt', created_row.submitted_at
  );
end;
$$;

alter function workspace_private.create_program_submission_impl(
  uuid, uuid, text, text, text, integer, text, text, text, text, text, text, text, bigint, text, text
) owner to postgres;
revoke all on function workspace_private.create_program_submission_impl(
  uuid, uuid, text, text, text, integer, text, text, text, text, text, text, text, bigint, text, text
) from public, anon, authenticated;
grant execute on function workspace_private.create_program_submission_impl(
  uuid, uuid, text, text, text, integer, text, text, text, text, text, text, text, bigint, text, text
) to service_role;

create or replace function public.create_program_submission(
  target_submission_id uuid,
  target_user_id uuid,
  target_conference_slug text,
  target_conference_name text,
  target_conference_acronym text,
  target_conference_year integer,
  target_discipline text,
  target_official_conference_url text,
  target_notes text,
  target_submission_kind text,
  target_program_url text,
  target_storage_path text,
  target_file_name text,
  target_file_size_bytes bigint,
  target_mime_type text,
  target_content_sha256 text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select workspace_private.create_program_submission_impl(
    target_submission_id,
    target_user_id,
    target_conference_slug,
    target_conference_name,
    target_conference_acronym,
    target_conference_year,
    target_discipline,
    target_official_conference_url,
    target_notes,
    target_submission_kind,
    target_program_url,
    target_storage_path,
    target_file_name,
    target_file_size_bytes,
    target_mime_type,
    target_content_sha256
  );
$$;

revoke all on function public.create_program_submission(
  uuid, uuid, text, text, text, integer, text, text, text, text, text, text, text, bigint, text, text
) from public, anon, authenticated;
grant execute on function public.create_program_submission(
  uuid, uuid, text, text, text, integer, text, text, text, text, text, text, text, bigint, text, text
) to service_role;

create or replace function workspace_private.transition_program_submission_impl(
  target_submission_id uuid,
  target_expected_status text,
  target_next_status text,
  target_reason text default null
)
returns public.program_submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_row public.program_submissions;
  updated_row public.program_submissions;
  current_actor uuid;
  allowed_transition boolean;
begin
  if (select auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'admin' then
    raise sqlstate '42501' using message = 'administrator role required';
  end if;

  current_actor := auth.uid();
  if current_actor is null then
    raise sqlstate '28000' using message = 'authenticated administrator required';
  end if;

  if target_reason is not null and char_length(target_reason) > 4000 then
    raise sqlstate '22023' using message = 'review reason is too long';
  end if;

  select * into current_row
  from public.program_submissions
  where id = target_submission_id
  for update;

  if not found then
    raise sqlstate 'P0002' using message = 'submission not found';
  end if;
  if current_row.status <> target_expected_status then
    raise sqlstate '40001' using message = 'submission status changed';
  end if;

  allowed_transition :=
    (target_expected_status = 'submitted' and target_next_status in ('under_review', 'rejected'))
    or (target_expected_status = 'under_review' and target_next_status in ('approved', 'rejected'))
    or (target_expected_status = 'approved' and target_next_status in ('import_preview', 'rejected'))
    or (target_expected_status = 'import_preview' and target_next_status in ('imported', 'rejected'));

  if not allowed_transition then
    raise sqlstate '22023' using message = 'invalid submission transition';
  end if;
  if target_next_status = 'imported' then
    raise sqlstate '22023' using message = 'use confirm_program_import to import';
  end if;
  if target_next_status = 'rejected' and nullif(btrim(target_reason), '') is null then
    raise sqlstate '22023' using message = 'a rejection reason is required';
  end if;

  update public.program_submissions
  set status = target_next_status,
      review_reason = nullif(btrim(target_reason), ''),
      reviewed_by = current_actor,
      reviewed_at = now(),
      updated_at = now()
  where id = target_submission_id
    and status = target_expected_status
  returning * into updated_row;

  if not found then
    raise sqlstate '40001' using message = 'submission status changed';
  end if;

  insert into workspace_private.submission_events (
    submission_id, actor_user_id, from_status, to_status, event_type, detail
  ) values (
    target_submission_id,
    current_actor,
    target_expected_status,
    target_next_status,
    'status_transition',
    case
      when target_reason is null then '{}'::jsonb
      else jsonb_build_object('reason', btrim(target_reason))
    end
  );

  return updated_row;
end;
$$;

alter function workspace_private.transition_program_submission_impl(uuid, text, text, text) owner to postgres;
revoke all on function workspace_private.transition_program_submission_impl(uuid, text, text, text) from public, anon, authenticated;
grant execute on function workspace_private.transition_program_submission_impl(uuid, text, text, text) to authenticated;

create or replace function public.transition_program_submission(
  submission_id uuid,
  expected_status text,
  next_status text,
  reason text default null
)
returns public.program_submissions
language sql
security invoker
set search_path = ''
as $$
  select workspace_private.transition_program_submission_impl(
    submission_id,
    expected_status,
    next_status,
    reason
  );
$$;

revoke all on function public.transition_program_submission(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.transition_program_submission(uuid, text, text, text) to authenticated;

create or replace function workspace_private.confirm_program_import_impl(target_submission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  submission_row public.program_submissions;
  preview_row workspace_private.program_import_previews;
  current_actor uuid;
  source_id uuid;
  run_id uuid;
  staged_valid_count integer;
  imported_count integer := 0;
  final_coverage text := 'program_only';
begin
  if (select auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'admin' then
    raise sqlstate '42501' using message = 'administrator role required';
  end if;
  current_actor := auth.uid();
  if current_actor is null then
    raise sqlstate '28000' using message = 'authenticated administrator required';
  end if;

  select * into submission_row
  from public.program_submissions
  where id = target_submission_id
  for update;

  if not found then
    raise sqlstate 'P0002' using message = 'submission not found';
  end if;
  if submission_row.status <> 'import_preview' then
    raise sqlstate '22023' using message = 'submission is not ready for import';
  end if;

  select * into preview_row
  from workspace_private.program_import_previews
  where submission_id = target_submission_id
  for update;

  if not found then
    raise sqlstate 'P0002' using message = 'import preview not found';
  end if;
  if preview_row.preview_status <> 'valid' then
    raise sqlstate '22023' using message = 'import preview is not valid';
  end if;

  select count(*)::integer into staged_valid_count
  from workspace_private.program_import_records
  where submission_id = target_submission_id
    and validation_status = 'valid';

  if staged_valid_count <> preview_row.record_count then
    raise sqlstate '22023' using message = 'import preview record count changed';
  end if;

  if preview_row.record_count > 0 then
    insert into public.ingestion_runs (
      source_adapter,
      source_label,
      input_sha256,
      status,
      total_records
    ) values (
      'moderated-conference-program',
      submission_row.conference_slug,
      preview_row.source_sha256,
      'started',
      preview_row.record_count + preview_row.rejected_count
    )
    returning id into run_id;

    insert into public.conference_sources as existing_source (
      conference_slug,
      conference_name,
      conference_year,
      homepage_url,
      program_url,
      source_type,
      discovery_method,
      status,
      last_crawled_at,
      last_success_at
    ) values (
      submission_row.conference_slug,
      submission_row.conference_name,
      submission_row.conference_year,
      submission_row.official_conference_url,
      coalesce(submission_row.program_url, submission_row.official_conference_url),
      'snapshot',
      'manual',
      'active',
      now(),
      now()
    )
    on conflict (conference_slug, conference_year, program_url) do update
    set conference_name = excluded.conference_name,
        homepage_url = excluded.homepage_url,
        status = 'active',
        last_crawled_at = excluded.last_crawled_at,
        last_success_at = excluded.last_success_at,
        updated_at = now()
    returning id into source_id;

    with upserted as (
      insert into public.papers as existing_paper (
        conference_source_id,
        source_record_id,
        conference_slug,
        conference_name,
        conference_year,
        title,
        abstract,
        authors,
        division,
        session_title,
        session_type,
        keywords,
        source_url,
        retrieved_at,
        raw_hash,
        embedding_input_hash,
        last_ingestion_run_id
      )
      select
        source_id,
        import_record.source_record_id,
        submission_row.conference_slug,
        submission_row.conference_name,
        submission_row.conference_year,
        import_record.title,
        import_record.abstract,
        import_record.authors,
        import_record.division,
        import_record.session_title,
        import_record.session_type,
        import_record.keywords,
        import_record.source_url,
        now(),
        import_record.raw_hash,
        import_record.embedding_input_hash,
        run_id
      from workspace_private.program_import_records import_record
      where import_record.submission_id = target_submission_id
        and import_record.validation_status = 'valid'
      on conflict (conference_slug, conference_year, source_record_id) do update
      set conference_source_id = excluded.conference_source_id,
          conference_name = excluded.conference_name,
          title = excluded.title,
          abstract = excluded.abstract,
          authors = excluded.authors,
          division = excluded.division,
          session_title = excluded.session_title,
          session_type = excluded.session_type,
          keywords = excluded.keywords,
          source_url = excluded.source_url,
          retrieved_at = excluded.retrieved_at,
          raw_hash = excluded.raw_hash,
          embedding = case
            when existing_paper.embedding_input_hash is distinct from excluded.embedding_input_hash then null
            else existing_paper.embedding
          end,
          embedding_model = case
            when existing_paper.embedding_input_hash is distinct from excluded.embedding_input_hash then null
            else existing_paper.embedding_model
          end,
          embedding_dimensions = case
            when existing_paper.embedding_input_hash is distinct from excluded.embedding_input_hash then null
            else existing_paper.embedding_dimensions
          end,
          embedding_updated_at = case
            when existing_paper.embedding_input_hash is distinct from excluded.embedding_input_hash then null
            else existing_paper.embedding_updated_at
          end,
          embedding_input_hash = excluded.embedding_input_hash,
          last_ingestion_run_id = excluded.last_ingestion_run_id,
          updated_at = now()
      returning id, embedding, embedding_input_hash
    )
    insert into public.embedding_jobs as existing_job (
      paper_id, input_hash, model, dimensions, status, attempts, next_attempt_at, created_at, updated_at
    )
    select
      upserted.id,
      upserted.embedding_input_hash,
      'text-embedding-3-small',
      512,
      'pending',
      0,
      now(),
      now(),
      now()
    from upserted
    where upserted.embedding is null
    on conflict (paper_id) do update
    set input_hash = excluded.input_hash,
        model = excluded.model,
        dimensions = excluded.dimensions,
        status = 'pending',
        attempts = 0,
        next_attempt_at = now(),
        lease_expires_at = null,
        last_error_code = null,
        completed_at = null,
        updated_at = now();

    select count(*)::integer into imported_count
    from public.papers
    where conference_slug = submission_row.conference_slug
      and conference_year = submission_row.conference_year;

    update public.ingestion_runs
    set status = 'completed',
        completed_at = now(),
        inserted_records = preview_row.record_count,
        rejected_records = preview_row.rejected_count,
        embedding_jobs_created = (
          select count(*)::integer
          from public.embedding_jobs
          join public.papers on papers.id = embedding_jobs.paper_id
          where papers.last_ingestion_run_id = run_id
            and embedding_jobs.status = 'pending'
        )
    where id = run_id;

    final_coverage := case when preview_row.rejected_count > 0 then 'partial' else 'indexed' end;
  end if;

  insert into public.conference_programs as existing_program (
    slug,
    conference_name,
    conference_acronym,
    conference_year,
    discipline,
    official_conference_url,
    program_url,
    source_submission_id,
    coverage_status,
    paper_count,
    provenance_note,
    published_at,
    last_verified_at
  ) values (
    submission_row.conference_slug,
    submission_row.conference_name,
    submission_row.conference_acronym,
    submission_row.conference_year,
    submission_row.discipline,
    submission_row.official_conference_url,
    submission_row.program_url,
    submission_row.id,
    final_coverage,
    imported_count,
    submission_row.notes,
    now(),
    now()
  )
  on conflict (slug) do update
  set conference_name = excluded.conference_name,
      conference_acronym = excluded.conference_acronym,
      conference_year = excluded.conference_year,
      discipline = excluded.discipline,
      official_conference_url = excluded.official_conference_url,
      program_url = excluded.program_url,
      source_submission_id = excluded.source_submission_id,
      coverage_status = excluded.coverage_status,
      paper_count = excluded.paper_count,
      provenance_note = excluded.provenance_note,
      published_at = coalesce(existing_program.published_at, now()),
      last_verified_at = now();

  update public.program_submissions
  set status = 'imported',
      reviewed_by = current_actor,
      reviewed_at = now(),
      updated_at = now()
  where id = target_submission_id
    and status = 'import_preview';

  if not found then
    raise sqlstate '40001' using message = 'submission status changed';
  end if;

  insert into workspace_private.submission_events (
    submission_id, actor_user_id, from_status, to_status, event_type, detail
  ) values (
    target_submission_id,
    current_actor,
    'import_preview',
    'imported',
    'import_confirmed',
    jsonb_build_object(
      'coverageStatus', final_coverage,
      'paperCount', imported_count,
      'ingestionRunId', run_id
    )
  );

  return jsonb_build_object(
    'submissionId', target_submission_id,
    'status', 'imported',
    'coverageStatus', final_coverage,
    'paperCount', imported_count,
    'ingestionRunId', run_id
  );
end;
$$;

alter function workspace_private.confirm_program_import_impl(uuid) owner to postgres;
revoke all on function workspace_private.confirm_program_import_impl(uuid) from public, anon, authenticated;
grant execute on function workspace_private.confirm_program_import_impl(uuid) to authenticated;

create or replace function public.confirm_program_import(submission_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select workspace_private.confirm_program_import_impl(submission_id);
$$;

revoke all on function public.confirm_program_import(uuid) from public, anon, authenticated;
grant execute on function public.confirm_program_import(uuid) to authenticated;

create or replace function public.save_program_import_preview(
  target_submission_id uuid,
  target_actor_user_id uuid,
  target_source_sha256 text,
  target_mode text,
  target_records jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare accepted integer; rejected integer;
begin
  if auth.role() is distinct from 'service_role' then raise sqlstate '42501' using message = 'service role required'; end if;
  if target_mode not in ('structured','program_only') or target_source_sha256 !~ '^[0-9a-f]{64}$' or jsonb_typeof(target_records) <> 'array' then raise sqlstate '22023' using message = 'invalid preview'; end if;
  perform 1 from public.program_submissions where id=target_submission_id and status='approved' for update;
  if not found then raise sqlstate '40001' using message='submission is not approved'; end if;
  accepted := (select count(*) from jsonb_array_elements(target_records) row where row->>'validation_status'='valid');
  rejected := jsonb_array_length(target_records)-accepted;
  insert into workspace_private.program_import_previews(submission_id,preview_status,parser_name,parser_version,source_sha256,record_count,rejected_count,safe_summary,created_by)
  values(target_submission_id,'valid','bounded-json-csv','1',target_source_sha256,accepted,rejected,jsonb_build_object('mode',target_mode,'accepted',accepted,'rejected',rejected),target_actor_user_id)
  on conflict(submission_id) do update set preview_status='valid',source_sha256=excluded.source_sha256,record_count=excluded.record_count,rejected_count=excluded.rejected_count,safe_summary=excluded.safe_summary,created_by=excluded.created_by,updated_at=now();
  delete from workspace_private.program_import_records where submission_id=target_submission_id;
  insert into workspace_private.program_import_records(submission_id,record_index,validation_status,validation_errors,source_record_id,title,abstract,authors,division,session_title,session_type,keywords,source_url,raw_hash,embedding_input_hash)
  select target_submission_id,(row->>'record_index')::integer,row->>'validation_status',coalesce(row->'validation_errors','[]'::jsonb),row->>'source_record_id',row->>'title',row->>'abstract',row->'authors',row->>'division',row->>'session_title',row->>'session_type',coalesce(array(select jsonb_array_elements_text(row->'keywords')),array[]::text[]),row->>'source_url',row->>'raw_hash',row->>'embedding_input_hash'
  from jsonb_array_elements(target_records) row;
  update public.program_submissions set status='import_preview',updated_at=now(),reviewed_by=target_actor_user_id,reviewed_at=now() where id=target_submission_id;
  insert into workspace_private.submission_events(submission_id,actor_user_id,from_status,to_status,event_type,detail) values(target_submission_id,target_actor_user_id,'approved','import_preview','preview_created',jsonb_build_object('accepted',accepted,'rejected',rejected,'mode',target_mode));
  return jsonb_build_object('submissionId',target_submission_id,'status','import_preview','mode',target_mode,'accepted',accepted,'rejected',rejected);
end; $$;
alter function public.save_program_import_preview(uuid,uuid,text,text,jsonb) owner to postgres;
revoke all on function public.save_program_import_preview(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_program_import_preview(uuid,uuid,text,text,jsonb) to service_role;
