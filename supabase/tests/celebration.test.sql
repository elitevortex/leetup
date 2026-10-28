-- solve_celebration(): what the post-solve celebration shows.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

create function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@test.dev'),
  ('00000000-0000-0000-0000-0000000000b1', 'b1@test.dev');
insert into public.profiles (id, username, display_name) values
  ('00000000-0000-0000-0000-0000000000a1', 'amy', 'Amy'),
  ('00000000-0000-0000-0000-0000000000b1', 'bob', 'Bob');
insert into public.problems (slug, frontend_id, title, difficulty) values
  ('two-sum', 1, 'Two Sum', 'Easy'),
  ('valid-parentheses', 20, 'Valid Parentheses', 'Easy'),
  ('lru-cache', 146, 'LRU Cache', 'Medium')
on conflict (slug) do nothing;
insert into public.friendships (requester_id, addressee_id, status) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'accepted');

-- Bob has 2 points today; Amy solved an Easy in 200s two days ago
insert into public.solves (user_id, problem_slug, time_seconds, lc_submission_id, solved_at, created_at) values
  ('00000000-0000-0000-0000-0000000000b1', 'two-sum', 300, 'b-1', now(), now()),
  ('00000000-0000-0000-0000-0000000000b1', 'valid-parentheses', 300, 'b-2', now(), now()),
  ('00000000-0000-0000-0000-0000000000a1', 'two-sum', 200, 'a-old', now() - interval '9 days', now() - interval '9 days');

-- Amy's first solve today: a Medium (+3) that takes her past Bob
insert into public.solves (id, user_id, problem_slug, time_seconds, lc_submission_id, solved_at)
values ('20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'lru-cache', 1200, 'a-1', now());
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');

select is((public.solve_celebration('20000000-0000-0000-0000-0000000000a1') ->> 'first_today')::boolean, true,
  'first solve of the day unlocks Home');
select is((public.solve_celebration('20000000-0000-0000-0000-0000000000a1') ->> 'rank_before')::int, 2, 'Bob was ahead before');
select is((public.solve_celebration('20000000-0000-0000-0000-0000000000a1') ->> 'rank_after')::int, 1, 'Amy is first after');
select is((public.solve_celebration('20000000-0000-0000-0000-0000000000a1') -> 'passed' ->> 0), 'Bob', 'the solve passed Bob');
select is(json_array_length(public.solve_celebration('20000000-0000-0000-0000-0000000000a1') -> 'friends_today'), 1,
  'one friend solved today');
select is((public.solve_celebration('20000000-0000-0000-0000-0000000000a1') ->> 'personal_best')::boolean, false,
  'no earlier Medium means no personal best');

-- A second solve today: a faster Easy than her old 200s
select set_config('role', 'postgres', true);
insert into public.solves (id, user_id, problem_slug, time_seconds, lc_submission_id, solved_at)
values ('20000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', 'valid-parentheses', 150, 'a-2', now());
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');

select is((public.solve_celebration('20000000-0000-0000-0000-0000000000a2') ->> 'first_today')::boolean, false,
  'later solves don''t unlock again');
select is((public.solve_celebration('20000000-0000-0000-0000-0000000000a2') ->> 'solves_today')::int, 2, 'counts today''s solves');
select is((public.solve_celebration('20000000-0000-0000-0000-0000000000a2') ->> 'personal_best')::boolean, true,
  'beating the old Easy time is a personal best');

-- Someone else's solve reveals nothing
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select ok(public.solve_celebration('20000000-0000-0000-0000-0000000000a1') is null, 'only the poster can read it');

select * from finish();
rollback;
