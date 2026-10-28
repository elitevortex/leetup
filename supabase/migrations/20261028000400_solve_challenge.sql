-- Unverified LeetCode links: people can use the app straight after entering their username.
-- Their first post verifies the account: it must be one of three random easy problems issued here,
-- submitted after they were issued (only the account owner can submit on that account).
alter table public.leetcode_links
  add column challenge_slugs text[] not null default '{}',
  add column challenge_issued_at timestamptz;
