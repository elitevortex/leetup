-- @mentions in comments: tagging someone notifies them, as long as they can see the post
-- (the owner or one of the owner's friends) and nobody involved has blocked anyone.

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in ('like', 'comment', 'mention', 'friend_request', 'friend_accept'));

-- Usernames are ^[a-z0-9_]{3,20}$; the lookbehind skips emails like a@b.com
create or replace function public.comment_mentions(body text)
returns text[]
language sql immutable set search_path = ''
as $$
  select coalesce(array_agg(distinct lower(m[1])), '{}')
  from regexp_matches(body, '(?<![A-Za-z0-9_])@([A-Za-z0-9_]{3,20})(?![A-Za-z0-9_])', 'g') as m
$$;

create or replace function public.notify_on_mention()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare owner uuid;
begin
  select s.user_id into owner from public.solves s where s.id = new.solve_id;
  if owner is null then
    return new;
  end if;
  insert into public.notifications (user_id, actor_id, kind, solve_id, comment_id)
  select p.id, new.user_id, 'mention', new.solve_id, new.id
  from public.profiles p
  where p.username = any (public.comment_mentions(new.body))
    and p.id <> new.user_id
    -- The owner already gets a comment notification
    and p.id <> owner
    and public.are_friends(owner, p.id)
    and not public.is_blocked(p.id, new.user_id)
    and not public.is_blocked(p.id, owner)
  limit 10;
  return new;
end;
$$;
create trigger comments_notify_mentions after insert on public.comments
  for each row execute function public.notify_on_mention();

-- Who you can tag on a post: its owner and people in the thread, plus your own friends who can
-- see it. Limited to your friends so it doesn't reveal the owner's whole friend list.
create or replace function public.mention_candidates(p_solve uuid, q text default '')
returns table (id uuid, username text, display_name text, avatar_url text)
language sql stable security definer set search_path = ''
as $$
  with post as (
    select s.user_id as owner from public.solves s
    where s.id = p_solve
      and (s.user_id = auth.uid() or public.are_friends(auth.uid(), s.user_id))
  ),
  thread as (
    select distinct c.user_id from public.comments c where c.solve_id = p_solve
  )
  select p.id, p.username, p.display_name, p.avatar_url
  from public.profiles p, post
  where p.id <> auth.uid()
    and not public.is_blocked(auth.uid(), p.id)
    and (
      p.id = post.owner
      or (public.are_friends(post.owner, p.id)
          and (p.id in (select user_id from thread) or public.are_friends(auth.uid(), p.id)))
    )
    and (
      coalesce(q, '') = ''
      or left(p.username, length(q)) = lower(q)
      or position(lower(q) in lower(p.display_name)) > 0
    )
  order by (p.id = post.owner) desc, (p.id in (select user_id from thread)) desc, p.username
  limit 6
$$;

revoke execute on function public.mention_candidates(uuid, text) from anon, public;
grant execute on function public.mention_candidates(uuid, text) to authenticated;
revoke execute on function public.notify_on_mention() from anon, public, authenticated;
