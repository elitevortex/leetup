-- Frictionless onboarding:
--   * First-day pass: the feed is open on the local day you joined, so new people can look around
--     before posting. The lock starts at their first midnight.
--   * Any post verifies: the first Accepted submission made after linking proves ownership, so the
--     challenge problems go. A solve is the weakest proof (someone could post another person's
--     public submission), so GitHub or the bio code can take a username back from a solve-verified link.

alter table public.leetcode_links
  add column claimed_at timestamptz not null default now(),
  add column verified_method text check (verified_method in ('github', 'bio', 'solve'));

update public.leetcode_links set claimed_at = coalesce(challenge_issued_at, created_at);
update public.leetcode_links set verified_method = 'solve' where verified_at is not null;

alter table public.leetcode_links
  drop column challenge_slugs,
  drop column challenge_issued_at;

create or replace function public.feed_unlocked(uid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.has_posted_today(uid)
    or exists (select 1 from public.profiles p where p.id = uid and p.created_at >= public.day_start(uid))
$$;

-- What Home needs to know about the viewer's own lock
create or replace function public.my_feed_state()
returns json
language sql stable security definer set search_path = ''
as $$
  select json_build_object(
    'unlocked', public.feed_unlocked(auth.uid()),
    'posted_today', public.has_posted_today(auth.uid()),
    'first_day', exists (select 1 from public.profiles p where p.id = auth.uid() and p.created_at >= public.day_start(auth.uid()))
  )
$$;

revoke execute on function public.feed_unlocked(uuid) from anon, public;
revoke execute on function public.my_feed_state() from anon, public;
-- The solves policy calls it as the viewer
grant execute on function public.feed_unlocked(uuid) to authenticated;
grant execute on function public.my_feed_state() to authenticated;

drop policy "Own solves, and friends' solves once you've posted today" on public.solves;
create policy "Own solves, and friends' solves once you've posted today or on your first day"
  on public.solves for select to authenticated
  using (
    user_id = auth.uid()
    or (
      public.are_friends(auth.uid(), user_id)
      and not public.is_blocked(auth.uid(), user_id)
      and (created_at < public.day_start(auth.uid()) or public.feed_unlocked(auth.uid()))
    )
  );
