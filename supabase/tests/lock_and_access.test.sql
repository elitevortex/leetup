-- Access rules: the post-to-unlock lock, server-only writes, friendships and blocking.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- Act as a signed-in user, or go back to the service role (postgres)
create function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- A = viewer, B = A's friend, C = stranger
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.dev'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.dev'),
  ('00000000-0000-0000-0000-00000000000c', 'c@test.dev'),
  ('00000000-0000-0000-0000-00000000000d', 'd@test.dev');
-- Everyone but D joined days ago, so only D is on their first-day pass
insert into public.profiles (id, username, display_name, created_at) values
  ('00000000-0000-0000-0000-00000000000a', 'alice', 'Alice', now() - interval '3 days'),
  ('00000000-0000-0000-0000-00000000000b', 'bob', 'Bob', now() - interval '3 days'),
  ('00000000-0000-0000-0000-00000000000c', 'cara', 'Cara', now() - interval '3 days'),
  ('00000000-0000-0000-0000-00000000000d', 'dev', 'Dev', now());
insert into public.leetcode_links (user_id, leetcode_username, verify_code) values
  ('00000000-0000-0000-0000-00000000000b', 'bob_lc', 'leetup-SECRET');
insert into public.problems (slug, frontend_id, title, difficulty) values
  ('two-sum', 1, 'Two Sum', 'Easy'),
  ('lru-cache', 146, 'LRU Cache', 'Medium')
on conflict (slug) do nothing;
insert into public.friendships (requester_id, addressee_id, status) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 'accepted'),
  ('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000b', 'accepted');
insert into public.solves (id, user_id, problem_slug, time_seconds, lc_submission_id, solved_at, created_at) values
  ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'lru-cache', 1180, 'b-today', now(), now()),
  ('10000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-00000000000b', 'two-sum', 250, 'b-old', now() - interval '2 days', now() - interval '2 days'),
  ('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000c', 'two-sum', 300, 'c-today', now(), now());
insert into public.comments (solve_id, user_id, body) values
  ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'first');

-- ---- A has not posted today: locked ----
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');

select is((select count(*)::int from public.solves where id = '10000000-0000-0000-0000-0000000000b1'), 0,
  'locked: a friend''s solve from today is hidden');
select is((select count(*)::int from public.solves where id = '10000000-0000-0000-0000-0000000000b0'), 1,
  'locked: a friend''s older solve stays visible');
select is((select count(*)::int from public.solves where user_id = '00000000-0000-0000-0000-00000000000c'), 0,
  'strangers'' solves are never visible');
select is((select count(*)::int from public.comments where solve_id = '10000000-0000-0000-0000-0000000000b1'), 0,
  'locked: comments on a hidden solve are hidden');
select is((select count(*)::int from public.todays_feed_teasers()), 1,
  'locked: teasers list the friend''s solve from today');
select is((select difficulty || ':' || points from public.todays_feed_teasers()), 'Medium:3',
  'teasers expose difficulty and points');
select throws_ok(
  $$insert into public.likes (solve_id, user_id) values ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000a')$$,
  '42501', null, 'locked: cannot like a hidden solve');
select throws_ok(
  $$insert into public.solves (user_id, problem_slug, lc_submission_id, solved_at) values ('00000000-0000-0000-0000-00000000000a', 'two-sum', 'fake', now())$$,
  '42501', null, 'clients cannot insert solves directly');
select is((select count(*)::int from public.leetcode_links), 0,
  'other people''s verification codes are unreadable');
select throws_ok(
  $$update public.profiles set leetcode_username = 'stolen' where id = '00000000-0000-0000-0000-00000000000a'$$,
  '42501', null, 'clients cannot set their own LeetCode username');
select lives_ok(
  $$update public.profiles set display_name = 'Alice C' where id = '00000000-0000-0000-0000-00000000000a'$$,
  'clients can edit their display name');

select is((public.my_feed_state() ->> 'unlocked')::boolean, false,
  'locked: my_feed_state reports locked');

-- ---- D joined today: first-day pass ----
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select is((select count(*)::int from public.solves where id = '10000000-0000-0000-0000-0000000000b1'), 1,
  'first day: a friend''s solve from today is visible without posting');
select is((public.my_feed_state() ->> 'first_day')::boolean, true,
  'first day: my_feed_state reports the pass');
select is((select count(*)::int from public.solves where user_id = '00000000-0000-0000-0000-00000000000c'), 0,
  'first day: strangers stay hidden');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');

-- ---- A posts a verified solve (server side): unlocked ----
select pg_temp.as_service();
insert into public.solves (user_id, problem_slug, time_seconds, lc_submission_id, solved_at)
values ('00000000-0000-0000-0000-00000000000a', 'two-sum', 200, 'a-today', now());
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');

select is((select count(*)::int from public.solves where id = '10000000-0000-0000-0000-0000000000b1'), 1,
  'unlocked: after posting, today''s friend solve is visible');
select is((select count(*)::int from public.comments where solve_id = '10000000-0000-0000-0000-0000000000b1'), 1,
  'unlocked: its comments are visible');
select lives_ok(
  $$insert into public.likes (solve_id, user_id) values ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000a')$$,
  'unlocked: can like it');
select is((select count(*)::int from public.solves where user_id = '00000000-0000-0000-0000-00000000000c'), 0,
  'unlocked: strangers stay hidden');

select is(public.leetup_streak('00000000-0000-0000-0000-00000000000a'), 1,
  'posting today starts a one-day streak');
select is((public.profile_summary('bob') ->> 'relationship'), 'friends',
  'profile_summary reports friendship');
select is((public.profile_summary('cara') ->> 'relationship'), 'none',
  'profile_summary reports strangers');

-- ---- notifications ----
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.notifications where kind = 'like'), 1,
  'the like notified the solve owner');

-- ---- friend requests ----
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select lives_ok(
  $$insert into public.friendships (requester_id, addressee_id) values ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a')$$,
  'anyone can send a friend request');
select is((select count(*)::int from public.friendships where requester_id = '00000000-0000-0000-0000-00000000000c' and status = 'pending'), 1,
  'requests start pending');
-- The requester can't accept their own request (the row-level rule filters the update to nothing)
update public.friendships set status = 'accepted' where requester_id = '00000000-0000-0000-0000-00000000000c';
select pg_temp.as_service();
select is((select status from public.friendships where requester_id = '00000000-0000-0000-0000-00000000000c'), 'pending',
  'requesters cannot accept their own request');

-- ---- blocking ----
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into public.blocks (blocker_id, blocked_id) values ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.solves where user_id = '00000000-0000-0000-0000-00000000000b'), 0,
  'blocking hides every solve and ends the friendship');

select * from finish();
rollback;
