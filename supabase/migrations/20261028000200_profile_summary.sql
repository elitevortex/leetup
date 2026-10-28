-- LeetCode activity mirrored onto the profile (written by the sync-profile Edge Function)
alter table public.profiles
  add column lc_calendar jsonb not null default '{}'::jsonb,
  add column lc_streak int not null default 0,
  add column lc_active_days int not null default 0;

-- Consecutive local days with a LeetUp post, counting today or (if nothing yet today) yesterday
create or replace function public.leetup_streak(uid uuid)
returns int
language sql stable security definer set search_path = ''
as $$
  with tz as (
    select coalesce(p.timezone, 'UTC') as name from public.profiles p where p.id = uid
  ),
  today as (
    select (now() at time zone tz.name)::date as d from tz
  ),
  days as (
    select distinct (s.created_at at time zone tz.name)::date as d
    from public.solves s, tz
    where s.user_id = uid
  ),
  anchor as (
    select case
      when exists (select 1 from days, today where days.d = today.d) then (select d from today)
      when exists (select 1 from days, today where days.d = today.d - 1) then (select d - 1 from today)
    end as a
  ),
  runs as (
    -- On consecutive days, date + row number stays constant
    select d, d + (row_number() over (order by d desc))::int as g
    from days, anchor
    where anchor.a is not null and days.d <= anchor.a
  )
  select coalesce((select count(*)::int from runs, anchor where runs.g = anchor.a + 1), 0)
$$;

-- Everything a profile screen needs, from the viewer's point of view. Null if either side blocked.
create or replace function public.profile_summary(target_username text)
returns json
language sql stable security definer set search_path = ''
as $$
  select case when public.is_blocked(auth.uid(), p.id) then null else json_build_object(
    'id', p.id,
    'username', p.username,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url,
    'leetcode_username', p.leetcode_username,
    'lc_easy', p.lc_easy,
    'lc_medium', p.lc_medium,
    'lc_hard', p.lc_hard,
    'lc_ranking', p.lc_ranking,
    'lc_calendar', p.lc_calendar,
    'lc_synced_at', p.lc_synced_at,
    'streak', public.leetup_streak(p.id),
    'posted_today', public.has_posted_today(p.id),
    'friends_count', (
      select count(*)::int from public.friendships f
      where f.status = 'accepted' and p.id in (f.requester_id, f.addressee_id)
    ),
    'relationship', case
      when p.id = auth.uid() then 'self'
      when public.are_friends(auth.uid(), p.id) then 'friends'
      when exists (select 1 from public.friendships f where f.requester_id = auth.uid() and f.addressee_id = p.id) then 'request_sent'
      when exists (select 1 from public.friendships f where f.requester_id = p.id and f.addressee_id = auth.uid()) then 'request_received'
      else 'none'
    end
  ) end
  from public.profiles p
  where p.username = lower(target_username)
$$;

revoke execute on function public.leetup_streak(uuid) from anon, public;
revoke execute on function public.profile_summary(text) from anon, public;
grant execute on function public.leetup_streak(uuid) to authenticated;
grant execute on function public.profile_summary(text) to authenticated;
