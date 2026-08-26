create or replace function public.browse_corpus_papers(
  target_conference_slug text default null,
  target_query text default null,
  target_offset integer default 0,
  target_limit integer default 20
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $$
declare
  normalized_query text := nullif(btrim(target_query), '');
  normalized_conference text := nullif(btrim(target_conference_slug), '');
  result jsonb;
begin
  if target_offset < 0 or target_offset > 9980
    or target_limit < 1 or target_limit > 20
    or char_length(coalesce(normalized_query, '')) > 200
    or (normalized_conference is not null and normalized_conference !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$') then
    raise exception 'invalid corpus library query' using errcode = '22023';
  end if;

  with filtered as materialized (
    select p.id, p.title, p.abstract, p.authors, p.conference_slug, p.conference_name,
      p.conference_year, p.division, p.keywords, p.source_url,
      case when normalized_query is null then 0::real
        else ts_rank_cd(p.search_document, websearch_to_tsquery('english', normalized_query)) end as search_rank
    from public.papers p
    where (normalized_conference is null or p.conference_slug = normalized_conference)
      and (normalized_query is null or p.search_document @@ websearch_to_tsquery('english', normalized_query))
  ), page_rows as (
    select * from filtered
    order by search_rank desc, title asc, id asc
    offset target_offset
    limit target_limit
  )
  select jsonb_build_object(
    'total', (select count(*)::integer from filtered),
    'papers', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id,
      'title', title,
      'abstract', abstract,
      'authors', authors,
      'conferenceSlug', conference_slug,
      'conferenceName', conference_name,
      'conferenceYear', conference_year,
      'division', division,
      'keywords', keywords,
      'sourceUrl', source_url
    ) order by search_rank desc, title asc, id asc) from page_rows), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.browse_corpus_papers(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.browse_corpus_papers(text, text, integer, integer) to service_role;
