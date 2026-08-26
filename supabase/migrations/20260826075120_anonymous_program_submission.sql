create or replace function public.create_anonymous_program_submission(
  target_submission_id uuid,
  target_conference_slug text,
  target_conference_name text,
  target_conference_acronym text,
  target_conference_year integer,
  target_discipline text,
  target_official_conference_url text,
  target_notes text,
  target_program_url text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_row public.program_submissions;
begin
  if target_program_url is null then
    raise exception 'anonymous submissions require a program URL' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_program_url, 0));
  if exists (select 1 from public.program_submissions where program_url = target_program_url) then
    raise exception 'duplicate program submission' using errcode = '23505';
  end if;

  insert into public.program_submissions (
    id, user_id, conference_slug, conference_name, conference_acronym, conference_year,
    discipline, official_conference_url, notes, submission_kind, program_url,
    storage_path, rights_attested, rights_attested_at, file_name, file_size_bytes,
    mime_type, content_sha256, status, submitted_at
  ) values (
    target_submission_id, null, target_conference_slug, target_conference_name, target_conference_acronym,
    target_conference_year, target_discipline, target_official_conference_url, target_notes,
    'url', target_program_url, null, true, now(), null, null, null, null, 'submitted', now()
  ) returning * into created_row;

  insert into workspace_private.submission_events (
    submission_id, actor_user_id, from_status, to_status, event_type, detail
  ) values (
    created_row.id, null, null, 'submitted', 'anonymous_submission_created',
    jsonb_build_object('submissionKind', 'url')
  );

  return jsonb_build_object(
    'id', created_row.id,
    'status', created_row.status,
    'submittedAt', created_row.submitted_at
  );
end;
$$;

revoke all on function public.create_anonymous_program_submission(
  uuid, text, text, text, integer, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_anonymous_program_submission(
  uuid, text, text, text, integer, text, text, text, text
) to service_role;
