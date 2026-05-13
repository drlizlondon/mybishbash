create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  sync_code text unique not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mybishbash_state (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  state_json jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.mybishbash_state enable row level security;

-- MVP policy note:
-- MyBishBash uses a human sync code instead of Supabase Auth for this first shared-state pass.
-- That means the anon client must be able to create profiles, look up profiles by sync_code,
-- and read/write a state row once the profile id is known. This is not as strong as an
-- authenticated per-user policy; tighten this when Supabase Auth or one-time profile tokens
-- are introduced.
drop policy if exists "profiles can be created by anon" on public.profiles;
create policy "profiles can be created by anon"
  on public.profiles
  for insert
  to anon
  with check (true);

drop policy if exists "profiles can be found by sync code" on public.profiles;
create policy "profiles can be found by sync code"
  on public.profiles
  for select
  to anon
  using (true);

drop policy if exists "state can be created by connected profile" on public.mybishbash_state;
create policy "state can be created by connected profile"
  on public.mybishbash_state
  for insert
  to anon
  with check (true);

drop policy if exists "state can be read by connected profile" on public.mybishbash_state;
create policy "state can be read by connected profile"
  on public.mybishbash_state
  for select
  to anon
  using (true);

drop policy if exists "state can be updated by connected profile" on public.mybishbash_state;
create policy "state can be updated by connected profile"
  on public.mybishbash_state
  for update
  to anon
  using (true)
  with check (true);
