-- Keep account deletion aligned with the canonical profiles.user_id key.

create or replace function public.delete_user_workspace(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  paths jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise sqlstate '42501' using message = 'service role required';
  end if;

  select coalesce(jsonb_agg(storage_path), '[]'::jsonb)
  into paths
  from public.program_submissions
  where user_id = target_user_id
    and storage_path is not null
    and status = 'submitted';

  delete from public.saved_papers where user_id = target_user_id;
  delete from public.analysis_sessions where user_id = target_user_id;
  delete from public.profiles where user_id = target_user_id;
  update public.program_submissions set user_id = null where user_id = target_user_id;
  update workspace_private.submission_events set actor_user_id = null where actor_user_id = target_user_id;

  return jsonb_build_object('storagePaths', paths);
end;
$$;

alter function public.delete_user_workspace(uuid) owner to postgres;
revoke all on function public.delete_user_workspace(uuid) from public, anon, authenticated;
grant execute on function public.delete_user_workspace(uuid) to service_role;
