-- @mentions in comments: who gets notified and who shows up as a suggestion.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

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

-- Owen posts. Fran comments. Fred is friends with both, Fiona only with Owen, Sam only with Fran,
-- and Blake is Owen's friend who has blocked Fran.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'owen@test.dev'),
  ('00000000-0000-0000-0000-0000000000e2', 'fran@test.dev'),
  ('00000000-0000-0000-0000-0000000000e3', 'fred@test.dev'),
  ('00000000-0000-0000-0000-0000000000e4', 'fiona@test.dev'),
  ('00000000-0000-0000-0000-0000000000e5', 'sam@test.dev'),
  ('00000000-0000-0000-0000-0000000000e6', 'blake@test.dev');
insert into public.profiles (id, username, display_name) values
  ('00000000-0000-0000-0000-0000000000e1', 'owen', 'Owen'),
  ('00000000-0000-0000-0000-0000000000e2', 'fran', 'Fran'),
  ('00000000-0000-0000-0000-0000000000e3', 'fred', 'Fred'),
  ('00000000-0000-0000-0000-0000000000e4', 'fiona', 'Fiona'),
  ('00000000-0000-0000-0000-0000000000e5', 'sam', 'Sam'),
  ('00000000-0000-0000-0000-0000000000e6', 'blake', 'Blake');
insert into public.friendships (requester_id, addressee_id, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2', 'accepted'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e3', 'accepted'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e4', 'accepted'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e6', 'accepted'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e3', 'accepted'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e5', 'accepted');
insert into public.blocks (blocker_id, blocked_id) values
  ('00000000-0000-0000-0000-0000000000e6', '00000000-0000-0000-0000-0000000000e2');
insert into public.problems (slug, frontend_id, title, difficulty) values ('two-sum', 1, 'Two Sum', 'Easy')
on conflict (slug) do nothing;
insert into public.solves (id, user_id, problem_slug, time_seconds, lc_submission_id, solved_at) values
  ('20000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1', 'two-sum', 200, 'owen-1', now());

insert into public.comments (solve_id, user_id, body) values
  ('20000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2',
   'nice @fred @Fiona @sam @owen @fran @blake @nobody, mail me at fran@b.com');

select is(
  (select array_agg(p.username order by p.username) from public.notifications n join public.profiles p on p.id = n.user_id where n.kind = 'mention'),
  array['fiona', 'fred'],
  'mentions notify the owner''s friends, case-insensitively');
select is((select count(*)::int from public.notifications where user_id = '00000000-0000-0000-0000-0000000000e1' and kind in ('comment', 'mention')), 1,
  'the owner gets one comment notification, not a mention as well');
select is((select count(*)::int from public.notifications where user_id = '00000000-0000-0000-0000-0000000000e5' and kind in ('comment', 'mention')), 0,
  'people who can''t see the post aren''t notified');
select is((select count(*)::int from public.notifications where user_id = '00000000-0000-0000-0000-0000000000e6' and kind in ('comment', 'mention')), 0,
  'someone who blocked the commenter isn''t notified');

-- ---- Suggestions for Fran ----
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select is((select array_agg(username) from public.mention_candidates('20000000-0000-0000-0000-0000000000e1')),
  array['owen', 'fred'],
  'suggestions: the owner first, then your friends who can see the post');
select is((select array_agg(username) from public.mention_candidates('20000000-0000-0000-0000-0000000000e1', 'fr')),
  array['fred'], 'suggestions filter by what you''ve typed');

select pg_temp.as_service();
insert into public.comments (solve_id, user_id, body) values
  ('20000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e4', 'ty');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select is((select array_agg(username) from public.mention_candidates('20000000-0000-0000-0000-0000000000e1')),
  array['owen', 'fiona', 'fred'],
  'suggestions include people in the thread, ahead of other friends');

-- ---- Sam isn't Owen's friend ----
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e5');
select is((select count(*)::int from public.mention_candidates('20000000-0000-0000-0000-0000000000e1')), 0,
  'no suggestions on a post you can''t see');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e3');
select is((select count(*)::int from public.notifications where kind = 'mention'), 1,
  'you only see your own mentions');

select * from finish();
rollback;
