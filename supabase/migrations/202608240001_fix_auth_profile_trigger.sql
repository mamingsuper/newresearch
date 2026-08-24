-- PostgreSQL conditional expressions such as coalesce and nullif cannot be
-- schema-qualified. Recreate the signup trigger function so OAuth user inserts
-- can create their private profile without aborting the auth transaction.

create or replace function workspace_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  bounded_display_name text;
  validated_preferred_language text;
begin
  bounded_display_name := nullif(
    pg_catalog.left(pg_catalog.btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 100),
    ''
  );
  validated_preferred_language := case
    when new.raw_user_meta_data ->> 'preferred_language' in ('en', 'zh')
      then new.raw_user_meta_data ->> 'preferred_language'
    else 'en'
  end;

  insert into public.profiles (user_id, display_name, preferred_language)
  values (new.id, bounded_display_name, validated_preferred_language)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

alter function workspace_private.handle_new_user() owner to postgres;
revoke all on function workspace_private.handle_new_user() from public, anon, authenticated;
