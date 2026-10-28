-- This week's points for a user and their friends
create or replace function public.week_board(uid uuid, week_start timestamptz)
returns table (id uuid, display_name text, points int)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.display_name, coalesce(sum(public.points_for(pr.difficulty)), 0)::int
  from public.profiles p
  left join public.solves x on x.user_id = p.id and x.created_at >= week_start
  left join public.problems pr on pr.slug = x.problem_slug
  where p.id = uid or public.are_friends(uid, p.id)
  group by p.id, p.display_name
$$;
revoke execute on function public.week_board(uuid, timestamptz) from anon, public, authenticated;

-- What just happened when you posted a solve, for the celebration screen:
-- first of the day (the unlock), streak, weekly points and rank movement, personal best, milestones.
create or replace function public.solve_celebration(p_solve_id uuid)
returns json
language plpgsql stable security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  s public.solves;
  tz text;
  today_start timestamptz;
  week_start timestamptz;
  diff text;
  pts int;
  solves_today int;
  prev_best int;
  total int;
  after_pts int;
  before_pts int;
  rank_before int;
  rank_after int;
  board_size int;
  passed json;
  friends_today json;
begin
  select * into s from public.solves where id = p_solve_id and user_id = me;
  if not found then
    return null;
  end if;

  select coalesce(p.timezone, 'UTC') into tz from public.profiles p where p.id = me;
  today_start := public.day_start(me);
  week_start := date_trunc('week', now() at time zone tz) at time zone tz;

  select pr.difficulty into diff from public.problems pr where pr.slug = s.problem_slug;
  pts := public.points_for(diff);

  select count(*) into solves_today from public.solves x where x.user_id = me and x.created_at >= today_start;
  select count(*) into total from public.solves x where x.user_id = me;

  -- Fastest earlier timed solve at the same difficulty
  select min(x.time_seconds) into prev_best
  from public.solves x join public.problems pr on pr.slug = x.problem_slug
  where x.user_id = me and x.id <> s.id and pr.difficulty = diff and x.time_seconds is not null;

  -- This week's board: me and my friends
  select b.points into after_pts from public.week_board(me, week_start) b where b.id = me;
  before_pts := after_pts - pts;
  select count(*) into board_size from public.week_board(me, week_start);
  select 1 + count(*) into rank_after from public.week_board(me, week_start) b where b.id <> me and b.points > after_pts;
  select 1 + count(*) into rank_before from public.week_board(me, week_start) b where b.id <> me and b.points > before_pts;
  -- Strictly ahead before this solve, strictly behind after it
  select coalesce(json_agg(b.display_name order by b.points desc), '[]'::json) into passed
  from public.week_board(me, week_start) b where b.id <> me and b.points > before_pts and b.points < after_pts;

  select coalesce(json_agg(f order by f.latest desc), '[]'::json) into friends_today
  from (
    select p.id, p.display_name, p.avatar_url, max(x.created_at) as latest
    from public.solves x join public.profiles p on p.id = x.user_id
    where x.created_at >= today_start and x.user_id <> me and public.are_friends(me, x.user_id)
    group by p.id, p.display_name, p.avatar_url
  ) f;

  return json_build_object(
    'difficulty', diff,
    'points', pts,
    'time_seconds', s.time_seconds,
    'first_today', solves_today = 1,
    'solves_today', solves_today,
    'streak', public.leetup_streak(me),
    'total_solves', total,
    'previous_best', prev_best,
    'personal_best', s.time_seconds is not null and prev_best is not null and s.time_seconds < prev_best,
    'week_points', after_pts,
    'rank_before', rank_before,
    'rank_after', rank_after,
    'board_size', board_size,
    'passed', passed,
    'friends_today', friends_today
  );
end;
$$;

revoke execute on function public.solve_celebration(uuid) from anon, public;
grant execute on function public.solve_celebration(uuid) to authenticated;
