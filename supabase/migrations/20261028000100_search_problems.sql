-- Problem search for the Post Solve autocomplete: "146", "#146" or part of a title.
create or replace function public.search_problems(q text)
returns setof public.problems
language sql stable set search_path = ''
as $$
  with term as (select btrim(regexp_replace(coalesce(q, ''), '^#', '')) as t)
  select p.*
  from public.problems p, term
  where length(term.t) > 0
    and (
      (term.t ~ '^\d+$' and p.frontend_id::text like term.t || '%')
      or p.title ilike '%' || term.t || '%'
      or extensions.similarity(p.title, term.t) > 0.3
    )
  order by
    (term.t ~ '^\d+$' and p.frontend_id::text = term.t) desc,
    (p.title ilike term.t || '%') desc,
    extensions.similarity(p.title, term.t) desc,
    p.frontend_id
  limit 8
$$;

revoke execute on function public.search_problems(text) from anon, public;
grant execute on function public.search_problems(text) to authenticated;
