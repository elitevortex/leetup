-- LeetReal Database Schema
-- Run this in your Supabase SQL Editor

-- Profiles table (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  display_name text not null,
  avatar_url text,
  leetcode_username text,
  current_streak integer default 0,
  longest_streak integer default 0,
  total_solves integer default 0,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Public profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

-- Solves table
create table public.solves (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  problem_name text not null,
  problem_number integer,
  difficulty text check (difficulty in ('Easy', 'Medium', 'Hard')) not null,
  time_seconds integer not null,
  submissions integer default 1,
  runtime_percentile real,
  memory_percentile real,
  image_url text,
  created_at timestamptz default now()
);

alter table public.solves enable row level security;

create policy "Solves are viewable by everyone"
  on public.solves for select using (true);

create policy "Users can insert own solves"
  on public.solves for insert with check (auth.uid() = user_id);

create policy "Users can delete own solves"
  on public.solves for delete using (auth.uid() = user_id);

-- Create index for feed queries
create index solves_user_created on public.solves(user_id, created_at desc);
create index solves_created on public.solves(created_at desc);

-- Likes table
create table public.likes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  solve_id uuid references public.solves(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(user_id, solve_id)
);

alter table public.likes enable row level security;

create policy "Likes are viewable by everyone"
  on public.likes for select using (true);

create policy "Users can insert own likes"
  on public.likes for insert with check (auth.uid() = user_id);

create policy "Users can delete own likes"
  on public.likes for delete using (auth.uid() = user_id);

-- Friendships table
create table public.friendships (
  id uuid default gen_random_uuid() primary key,
  requester_id uuid references public.profiles(id) on delete cascade not null,
  addressee_id uuid references public.profiles(id) on delete cascade not null,
  status text check (status in ('pending', 'accepted')) default 'pending',
  created_at timestamptz default now(),
  unique(requester_id, addressee_id)
);

alter table public.friendships enable row level security;

create policy "Users can view own friendships"
  on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "Users can create friendships"
  on public.friendships for insert
  with check (auth.uid() = requester_id);

create policy "Users can update friendships addressed to them"
  on public.friendships for update
  using (auth.uid() = addressee_id);

-- Function to auto-increment total_solves on profiles
create or replace function public.increment_solve_count()
returns trigger as $$
begin
  update public.profiles
  set total_solves = total_solves + 1
  where id = new.user_id;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_solve_created
  after insert on public.solves
  for each row execute function public.increment_solve_count();

-- Function to decrement total_solves on delete
create or replace function public.decrement_solve_count()
returns trigger as $$
begin
  update public.profiles
  set total_solves = greatest(0, total_solves - 1)
  where id = old.user_id;
  return old;
end;
$$ language plpgsql security definer;

create trigger on_solve_deleted
  after delete on public.solves
  for each row execute function public.decrement_solve_count();
