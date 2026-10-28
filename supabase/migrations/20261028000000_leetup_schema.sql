-- LeetUp schema v1
--
-- Trust model:
--   * Solves are written only by the post-solve Edge Function (service role), after it finds a
--     matching Accepted submission on LeetCode. Clients cannot insert solves directly.
--   * LeetCode-derived fields (username, stats) are written only by Edge Functions.
--   * "Today" is the viewer's local day (profiles.timezone). Friends' solves posted today are
--     hidden from a viewer until that viewer has posted a solve today; todays_feed_teasers()
--     exposes only who / difficulty / points / when for the locked state.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Helpers that don't depend on tables
-- ---------------------------------------------------------------------------

create or replace function public.is_valid_timezone(tz text)
returns boolean
language plpgsql immutable
as $$
begin
  perform now() at time zone tz;
  return true;
exception when others then
  return false;
end;
$$;

create or replace function public.points_for(difficulty text)
returns int
language sql immutable
as $$
  select case difficulty when 'Easy' then 1 when 'Medium' then 3 when 'Hard' then 5 else 0 end
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_url text,
  timezone text not null default 'UTC' check (public.is_valid_timezone(timezone)),
  -- Set by Edge Functions once the LeetCode account is verified
  leetcode_username text unique,
  lc_easy int not null default 0,
  lc_medium int not null default 0,
  lc_hard int not null default 0,
  lc_ranking int,
  lc_synced_at timestamptz,
  created_at timestamptz not null default now()
);

-- Private: the verification code must never be readable by anyone but its owner
create table public.leetcode_links (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  leetcode_username text not null,
  verify_code text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
-- One LeetCode account can back only one verified LeetUp account
create unique index leetcode_links_verified_username
  on public.leetcode_links (lower(leetcode_username))
  where verified_at is not null;

-- Mirror of LeetCode's problem list, filled by the sync-problems Edge Function
create table public.problems (
  slug text primary key,
  frontend_id int not null,
  title text not null,
  difficulty text not null check (difficulty in ('Easy', 'Medium', 'Hard')),
  paid_only boolean not null default false,
  updated_at timestamptz not null default now()
);
create index problems_title_trgm on public.problems using gin (title extensions.gin_trgm_ops);
create index problems_frontend_id on public.problems (frontend_id);

create table public.solves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  problem_slug text not null references public.problems (slug),
  time_seconds int check (time_seconds is null or time_seconds between 1 and 86400),
  language text,
  note text check (char_length(note) <= 280),
  lc_submission_id text not null unique,
  solved_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index solves_user_created on public.solves (user_id, created_at desc);
create index solves_created on public.solves (created_at desc);

create table public.solve_media (
  id uuid primary key default gen_random_uuid(),
  solve_id uuid not null references public.solves (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('photo', 'video')),
  storage_path text not null unique,
  duration_seconds int check (duration_seconds is null or duration_seconds between 1 and 60),
  position smallint not null default 0 check (position between 0 and 3),
  created_at timestamptz not null default now(),
  unique (solve_id, position)
);

create table public.likes (
  solve_id uuid not null references public.solves (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (solve_id, user_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  solve_id uuid not null references public.solves (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index comments_solve on public.comments (solve_id, created_at);

create table public.friendships (
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
-- A pair can only have one friendship row, whoever asked first
create unique index friendships_pair
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee on public.friendships (addressee_id);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  solve_id uuid references public.solves (id) on delete set null,
  comment_id uuid references public.comments (id) on delete set null,
  reason text not null check (reason in ('spam', 'harassment', 'inappropriate', 'cheating', 'other')),
  details text check (char_length(details) <= 500),
  status text not null default 'open' check (status in ('open', 'reviewed', 'actioned')),
  created_at timestamptz not null default now(),
  check (num_nonnulls(solve_id, comment_id) = 1)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('like', 'comment', 'friend_request', 'friend_accept')),
  solve_id uuid references public.solves (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Access helpers (security definer so policies can call them without recursion)
-- ---------------------------------------------------------------------------

-- Start of the user's current local day, as an absolute timestamp
create or replace function public.day_start(uid uuid)
returns timestamptz
language sql stable security definer set search_path = ''
as $$
  select (date_trunc('day', now() at time zone coalesce(p.timezone, 'UTC')) at time zone coalesce(p.timezone, 'UTC'))
  from (select 1) as one
  left join public.profiles p on p.id = uid
$$;

create or replace function public.has_posted_today(uid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.solves s
    where s.user_id = uid and s.created_at >= public.day_start(uid)
  )
$$;

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b) or (f.requester_id = b and f.addressee_id = a))
  )
$$;

create or replace function public.is_blocked(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.blocks k
    where (k.blocker_id = a and k.blocked_id = b) or (k.blocker_id = b and k.blocked_id = a)
  )
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.leetcode_links enable row level security;
alter table public.problems enable row level security;
alter table public.solves enable row level security;
alter table public.solve_media enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.friendships enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.notifications enable row level security;

-- The app requires sign-in; nothing is readable anonymously
revoke all on all tables in schema public from anon;

-- Clients may only touch the columns granted below
revoke insert, update on public.profiles, public.leetcode_links, public.problems, public.solves,
  public.solve_media, public.likes, public.comments, public.friendships, public.blocks,
  public.reports, public.notifications from authenticated;

-- profiles
create policy "Signed-in users can see profiles not blocking them"
  on public.profiles for select to authenticated
  using (id = auth.uid() or not public.is_blocked(auth.uid(), id));
create policy "Users create their own profile"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy "Users edit their own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
grant insert (id, username, display_name, avatar_url, timezone) on public.profiles to authenticated;
grant update (display_name, avatar_url, timezone) on public.profiles to authenticated;

-- leetcode_links: read your own; Edge Functions write
create policy "Users see their own LeetCode link"
  on public.leetcode_links for select to authenticated
  using (user_id = auth.uid());

-- problems: public catalogue
create policy "Signed-in users can read problems"
  on public.problems for select to authenticated
  using (true);

-- solves: the lock lives here
create policy "Own solves, and friends' solves once you've posted today"
  on public.solves for select to authenticated
  using (
    user_id = auth.uid()
    or (
      public.are_friends(auth.uid(), user_id)
      and not public.is_blocked(auth.uid(), user_id)
      and (created_at < public.day_start(auth.uid()) or public.has_posted_today(auth.uid()))
    )
  );
create policy "Users delete their own solves"
  on public.solves for delete to authenticated
  using (user_id = auth.uid());
create policy "Users edit the note on their own solves"
  on public.solves for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant update (note) on public.solves to authenticated;

-- solve_media follows its solve's visibility (the subquery runs under the solves policy)
create policy "Media is visible when its solve is"
  on public.solve_media for select to authenticated
  using (exists (select 1 from public.solves s where s.id = solve_id));
create policy "Users attach media to their own solves"
  on public.solve_media for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.solves s where s.id = solve_id and s.user_id = auth.uid())
  );
create policy "Users remove their own media"
  on public.solve_media for delete to authenticated
  using (user_id = auth.uid());
grant insert (solve_id, user_id, kind, storage_path, duration_seconds, position) on public.solve_media to authenticated;

-- likes
create policy "Likes are visible when their solve is"
  on public.likes for select to authenticated
  using (exists (select 1 from public.solves s where s.id = solve_id) and not public.is_blocked(auth.uid(), user_id));
create policy "Users like solves they can see"
  on public.likes for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.solves s where s.id = solve_id));
create policy "Users remove their own likes"
  on public.likes for delete to authenticated
  using (user_id = auth.uid());
grant insert (solve_id, user_id) on public.likes to authenticated;

-- comments
create policy "Comments are visible when their solve is"
  on public.comments for select to authenticated
  using (exists (select 1 from public.solves s where s.id = solve_id) and not public.is_blocked(auth.uid(), user_id));
create policy "Users comment on solves they can see"
  on public.comments for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.solves s where s.id = solve_id));
create policy "Authors and post owners delete comments"
  on public.comments for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.solves s where s.id = solve_id and s.user_id = auth.uid())
  );
grant insert (solve_id, user_id, body) on public.comments to authenticated;

-- friendships
create policy "Users see friendships they're part of"
  on public.friendships for select to authenticated
  using (auth.uid() in (requester_id, addressee_id));
create policy "Users send friend requests"
  on public.friendships for insert to authenticated
  with check (requester_id = auth.uid() and status = 'pending' and not public.is_blocked(requester_id, addressee_id));
create policy "Addressees accept requests"
  on public.friendships for update to authenticated
  using (addressee_id = auth.uid() and status = 'pending')
  with check (addressee_id = auth.uid() and status = 'accepted');
create policy "Either side can decline, cancel or unfriend"
  on public.friendships for delete to authenticated
  using (auth.uid() in (requester_id, addressee_id));
grant insert (requester_id, addressee_id) on public.friendships to authenticated;
grant update (status) on public.friendships to authenticated;

-- blocks
create policy "Users see who they've blocked"
  on public.blocks for select to authenticated
  using (blocker_id = auth.uid());
create policy "Users block others"
  on public.blocks for insert to authenticated
  with check (blocker_id = auth.uid());
create policy "Users unblock"
  on public.blocks for delete to authenticated
  using (blocker_id = auth.uid());
grant insert (blocker_id, blocked_id) on public.blocks to authenticated;

-- reports: write-only for users; reviewed with the service role
create policy "Users file reports"
  on public.reports for insert to authenticated
  with check (reporter_id = auth.uid());
create policy "Users see their own reports"
  on public.reports for select to authenticated
  using (reporter_id = auth.uid());
grant insert (solve_id, comment_id, reason, details) on public.reports to authenticated;

-- notifications: written by triggers
create policy "Users see their own notifications"
  on public.notifications for select to authenticated
  using (user_id = auth.uid() and (actor_id is null or not public.is_blocked(user_id, actor_id)));
create policy "Users mark their notifications read"
  on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant update (read_at) on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public.friendships_set_responded_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status = 'accepted' and old.status = 'pending' then
    new.responded_at := now();
  end if;
  return new;
end;
$$;
create trigger friendships_responded_at before update on public.friendships
  for each row execute function public.friendships_set_responded_at();

-- Blocking someone ends any friendship or pending request between you
create or replace function public.blocks_remove_friendship()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.friendships f
  where (f.requester_id = new.blocker_id and f.addressee_id = new.blocked_id)
     or (f.requester_id = new.blocked_id and f.addressee_id = new.blocker_id);
  return new;
end;
$$;
create trigger blocks_remove_friendship after insert on public.blocks
  for each row execute function public.blocks_remove_friendship();

-- At most four media items per solve
create or replace function public.solve_media_limit()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (select count(*) from public.solve_media m where m.solve_id = new.solve_id) >= 4 then
    raise exception 'A solve can have at most 4 photos or videos';
  end if;
  return new;
end;
$$;
create trigger solve_media_limit before insert on public.solve_media
  for each row execute function public.solve_media_limit();

create or replace function public.notify_on_like()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare owner uuid;
begin
  select s.user_id into owner from public.solves s where s.id = new.solve_id;
  if owner is not null and owner <> new.user_id then
    insert into public.notifications (user_id, actor_id, kind, solve_id)
    values (owner, new.user_id, 'like', new.solve_id);
  end if;
  return new;
end;
$$;
create trigger likes_notify after insert on public.likes
  for each row execute function public.notify_on_like();

create or replace function public.notify_on_comment()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare owner uuid;
begin
  select s.user_id into owner from public.solves s where s.id = new.solve_id;
  if owner is not null and owner <> new.user_id then
    insert into public.notifications (user_id, actor_id, kind, solve_id, comment_id)
    values (owner, new.user_id, 'comment', new.solve_id, new.id);
  end if;
  return new;
end;
$$;
create trigger comments_notify after insert on public.comments
  for each row execute function public.notify_on_comment();

create or replace function public.notify_on_friendship()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, actor_id, kind)
    values (new.addressee_id, new.requester_id, 'friend_request');
  elsif new.status = 'accepted' and old.status = 'pending' then
    insert into public.notifications (user_id, actor_id, kind)
    values (new.requester_id, new.addressee_id, 'friend_accept');
  end if;
  return new;
end;
$$;
create trigger friendships_notify after insert or update on public.friendships
  for each row execute function public.notify_on_friendship();

-- ---------------------------------------------------------------------------
-- Read APIs (RPC)
-- ---------------------------------------------------------------------------

-- What a locked Home may show: who solved today, difficulty, points, when. Nothing else.
create or replace function public.todays_feed_teasers()
returns table (
  solve_id uuid,
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  difficulty text,
  points int,
  created_at timestamptz,
  media_count int
)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.user_id, p.username, p.display_name, p.avatar_url,
         pr.difficulty, public.points_for(pr.difficulty), s.created_at,
         (select count(*)::int from public.solve_media m where m.solve_id = s.id)
  from public.solves s
  join public.profiles p on p.id = s.user_id
  join public.problems pr on pr.slug = s.problem_slug
  where s.created_at >= public.day_start(auth.uid())
    and public.are_friends(auth.uid(), s.user_id)
    and not public.is_blocked(auth.uid(), s.user_id)
  order by s.created_at desc
$$;

-- This week's friends leaderboard (weeks start Monday in the viewer's time zone)
create or replace function public.weekly_leaderboard()
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  points int,
  solves int
)
language sql stable security definer set search_path = ''
as $$
  with me as (
    select coalesce(p.timezone, 'UTC') as tz from public.profiles p where p.id = auth.uid()
  ),
  week as (
    select date_trunc('week', now() at time zone me.tz) at time zone me.tz as starts from me
  ),
  people as (
    select auth.uid() as id
    union
    select case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
    from public.friendships f
    where f.status = 'accepted' and auth.uid() in (f.requester_id, f.addressee_id)
  )
  select p.id, p.username, p.display_name, p.avatar_url,
         coalesce(sum(public.points_for(pr.difficulty)), 0)::int,
         count(s.id)::int
  from people
  join public.profiles p on p.id = people.id
  left join public.solves s on s.user_id = p.id and s.created_at >= (select starts from week)
  left join public.problems pr on pr.slug = s.problem_slug
  group by p.id, p.username, p.display_name, p.avatar_url
  order by 5 desc, 6 desc, p.username
$$;

revoke execute on function public.todays_feed_teasers() from anon, public;
revoke execute on function public.weekly_leaderboard() from anon, public;
grant execute on function public.todays_feed_teasers() to authenticated;
grant execute on function public.weekly_leaderboard() to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: solve media
-- ---------------------------------------------------------------------------
-- Paths: {user_id}/{solve_id}/{file}. Reads go through solve_media, so they inherit the lock.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('solve-media', 'solve-media', false, 52428800,
        array['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'video/mp4', 'video/quicktime'])
on conflict (id) do nothing;

create policy "Users upload media into their own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'solve-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Media files are readable when their solve is"
  on storage.objects for select to authenticated
  using (bucket_id = 'solve-media' and exists (select 1 from public.solve_media m where m.storage_path = name));
create policy "Users delete their own media files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'solve-media' and (storage.foldername(name))[1] = auth.uid()::text);
