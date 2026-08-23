-- Private, user-owned research workspaces.
-- Browser roles receive only the table operations and RPCs required by the UI.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.valid_saved_paper_tags(candidate text[])
returns boolean
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select pg_catalog.cardinality(candidate) <= 20
    and not exists (
      select 1
      from pg_catalog.unnest(candidate) as item(tag)
      where tag is null
        or not (pg_catalog.char_length(tag) between 1 and 64)
    );
$$;

revoke all on function private.valid_saved_paper_tags(text[]) from public, anon, authenticated;
grant execute on function private.valid_saved_paper_tags(text[]) to authenticated;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text
    constraint profiles_display_name_length
      check (display_name is null or char_length(display_name) between 1 and 100),
  preferred_language text not null default 'en'
    constraint profiles_preferred_language
      check (preferred_language in ('en', 'zh')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saved_papers (
  user_id uuid not null references auth.users (id) on delete cascade,
  paper_id uuid not null references public.papers (id) on delete cascade,
  note text not null default ''
    constraint saved_papers_note_length check (char_length(note) <= 4000),
  tags text[] not null default '{}'::text[]
    constraint saved_papers_tag_count check (cardinality(tags) <= 20)
    constraint saved_papers_tag_items check (private.valid_saved_paper_tags(tags)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, paper_id)
);

create table if not exists public.analysis_sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null
    constraint analysis_sessions_title_length check (char_length(title) between 1 and 200),
  idea_text text not null
    constraint analysis_sessions_idea_length check (char_length(idea_text) between 20 and 5000),
  report jsonb not null
    constraint analysis_sessions_report_object check (jsonb_typeof(report) = 'object')
    constraint analysis_sessions_report_size check (octet_length(report::text) <= 65536),
  language text not null
    constraint analysis_sessions_language check (language in ('en', 'zh')),
  corpus_snapshot jsonb not null default '{}'::jsonb
    constraint analysis_sessions_corpus_object check (jsonb_typeof(corpus_snapshot) = 'object')
    constraint analysis_sessions_corpus_size check (octet_length(corpus_snapshot::text) <= 65536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.analysis_messages (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null references public.analysis_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null
    constraint analysis_messages_role check (role in ('user', 'assistant')),
  content jsonb not null
    constraint analysis_messages_content_size check (octet_length(content::text) <= 65536)
    constraint analysis_messages_role_content check (
      (role = 'user'
        and jsonb_typeof(content) = 'string'
        and char_length(content #>> '{}') between 1 and 5000)
      or
      (role = 'assistant' and jsonb_typeof(content) = 'object')
    ),
  created_at timestamptz not null default now()
);

create index if not exists saved_papers_user_created_at_idx
  on public.saved_papers (user_id, created_at desc);

create index if not exists analysis_sessions_user_updated_at_idx
  on public.analysis_sessions (user_id, updated_at desc);

create index if not exists analysis_messages_session_created_at_idx
  on public.analysis_messages (session_id, created_at);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;
grant execute on function private.set_updated_at() to authenticated;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

drop trigger if exists saved_papers_set_updated_at on public.saved_papers;
create trigger saved_papers_set_updated_at
before update on public.saved_papers
for each row execute function private.set_updated_at();

drop trigger if exists analysis_sessions_set_updated_at on public.analysis_sessions;
create trigger analysis_sessions_set_updated_at
before update on public.analysis_sessions
for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  bounded_display_name text;
  validated_preferred_language text;
begin
  bounded_display_name := pg_catalog.nullif(
    pg_catalog.left(pg_catalog.btrim(pg_catalog.coalesce(new.raw_user_meta_data ->> 'display_name', '')), 100),
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

alter function private.handle_new_user() owner to postgres;
revoke all on function private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

alter table public.profiles enable row level security;
alter table public.saved_papers enable row level security;
alter table public.analysis_sessions enable row level security;
alter table public.analysis_messages enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.saved_papers from anon, authenticated;
revoke all on table public.analysis_sessions from anon, authenticated;
revoke all on table public.analysis_messages from anon, authenticated;

grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.saved_papers to authenticated;
grant select, insert, update, delete on table public.analysis_sessions to authenticated;
grant select, insert on table public.analysis_messages to authenticated;

drop policy if exists "profiles owner select" on public.profiles;
create policy "profiles owner select"
on public.profiles for select
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

drop policy if exists "profiles owner update" on public.profiles;
create policy "profiles owner update"
on public.profiles for update
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

drop policy if exists "saved_papers owner select" on public.saved_papers;
create policy "saved_papers owner select"
on public.saved_papers for select
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

drop policy if exists "saved_papers owner insert" on public.saved_papers;
create policy "saved_papers owner insert"
on public.saved_papers for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

drop policy if exists "saved_papers owner update" on public.saved_papers;
create policy "saved_papers owner update"
on public.saved_papers for update
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

drop policy if exists "saved_papers owner delete" on public.saved_papers;
create policy "saved_papers owner delete"
on public.saved_papers for delete
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

drop policy if exists "analysis_sessions owner select" on public.analysis_sessions;
create policy "analysis_sessions owner select"
on public.analysis_sessions for select
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

drop policy if exists "analysis_sessions owner insert" on public.analysis_sessions;
create policy "analysis_sessions owner insert"
on public.analysis_sessions for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

drop policy if exists "analysis_sessions owner update" on public.analysis_sessions;
create policy "analysis_sessions owner update"
on public.analysis_sessions for update
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

drop policy if exists "analysis_sessions owner delete" on public.analysis_sessions;
create policy "analysis_sessions owner delete"
on public.analysis_sessions for delete
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

drop policy if exists "analysis_messages owner select" on public.analysis_messages;
create policy "analysis_messages owner select"
on public.analysis_messages for select
to authenticated
using (
  (select auth.uid()) is not null
  and analysis_messages.user_id = (select auth.uid())
  and exists (
    select 1
    from public.analysis_sessions
    where analysis_sessions.id = analysis_messages.session_id
      and analysis_sessions.user_id = (select auth.uid())
  )
);

drop policy if exists "analysis_messages owner insert" on public.analysis_messages;
create policy "analysis_messages owner insert"
on public.analysis_messages for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and analysis_messages.user_id = (select auth.uid())
  and exists (
    select 1
    from public.analysis_sessions
    where analysis_sessions.id = analysis_messages.session_id
      and analysis_sessions.user_id = (select auth.uid())
  )
);

create or replace function private.get_my_saved_papers_impl()
returns table (
  paper_id uuid,
  note text,
  tags text[],
  title text,
  authors jsonb,
  abstract text,
  conference_name text,
  conference_year integer,
  division text,
  keywords text[],
  source_url text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
begin
  current_user_id := (select auth.uid());
  if current_user_id is null then
    raise sqlstate '28000' using message = 'authentication required';
  end if;

  return query
  select
    saved.paper_id,
    saved.note,
    saved.tags,
    paper.title,
    paper.authors,
    paper.abstract,
    paper.conference_name,
    paper.conference_year,
    paper.division,
    paper.keywords,
    paper.source_url
  from public.saved_papers as saved
  join public.papers as paper on paper.id = saved.paper_id
  where saved.user_id = current_user_id
  order by saved.created_at desc;
end;
$$;

alter function private.get_my_saved_papers_impl() owner to postgres;
revoke all on function private.get_my_saved_papers_impl() from public, anon, authenticated;
grant execute on function private.get_my_saved_papers_impl() to authenticated;

create or replace function public.get_my_saved_papers()
returns table (
  paper_id uuid,
  note text,
  tags text[],
  title text,
  authors jsonb,
  abstract text,
  conference_name text,
  conference_year integer,
  division text,
  keywords text[],
  source_url text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.get_my_saved_papers_impl();
$$;

revoke all on function public.get_my_saved_papers() from public, anon, authenticated;
grant execute on function public.get_my_saved_papers() to authenticated;

create or replace function private.save_analysis_session_impl(
  target_title text,
  target_idea_text text,
  target_report jsonb,
  target_language text,
  target_corpus_snapshot jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid;
  created_session_id uuid;
begin
  current_user_id := (select auth.uid());
  if current_user_id is null then
    raise sqlstate '28000' using message = 'authentication required';
  end if;

  if target_title is null or not (pg_catalog.char_length(target_title) between 1 and 200) then
    raise exception 'title must contain between 1 and 200 characters' using errcode = '22023';
  end if;
  if target_idea_text is null or not (pg_catalog.char_length(target_idea_text) between 20 and 5000) then
    raise exception 'idea_text must contain between 20 and 5000 characters' using errcode = '22023';
  end if;
  if target_report is null
    or pg_catalog.jsonb_typeof(target_report) <> 'object'
    or pg_catalog.octet_length(target_report::text) > 65536 then
    raise exception 'report must be a JSON object no larger than 65536 bytes' using errcode = '22023';
  end if;
  if target_language is null or target_language not in ('en', 'zh') then
    raise exception 'language must be en or zh' using errcode = '22023';
  end if;
  if target_corpus_snapshot is null
    or pg_catalog.jsonb_typeof(target_corpus_snapshot) <> 'object'
    or pg_catalog.octet_length(target_corpus_snapshot::text) > 65536 then
    raise exception 'corpus_snapshot must be a JSON object no larger than 65536 bytes' using errcode = '22023';
  end if;

  insert into public.analysis_sessions (
    user_id,
    title,
    idea_text,
    report,
    language,
    corpus_snapshot
  )
  values (
    current_user_id,
    target_title,
    target_idea_text,
    target_report,
    target_language,
    target_corpus_snapshot
  )
  returning id into created_session_id;

  insert into public.analysis_messages (session_id, user_id, role, content)
  values
    (created_session_id, current_user_id, 'user', pg_catalog.to_jsonb(target_idea_text)),
    (created_session_id, current_user_id, 'assistant', target_report);

  return created_session_id;
end;
$$;

alter function private.save_analysis_session_impl(text, text, jsonb, text, jsonb) owner to postgres;
revoke all on function private.save_analysis_session_impl(text, text, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function private.save_analysis_session_impl(text, text, jsonb, text, jsonb) to authenticated;

create or replace function public.save_analysis_session(
  title text,
  idea_text text,
  report jsonb,
  language text,
  corpus_snapshot jsonb
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.save_analysis_session_impl(title, idea_text, report, language, corpus_snapshot);
$$;

revoke all on function public.save_analysis_session(text, text, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.save_analysis_session(text, text, jsonb, text, jsonb) to authenticated;
