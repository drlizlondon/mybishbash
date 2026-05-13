create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  signed_up_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

grant select, insert, update on public.user_profiles to authenticated;

drop policy if exists "users can read own profile" on public.user_profiles;
create policy "users can read own profile"
  on public.user_profiles for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "users can update own profile" on public.user_profiles;
create policy "users can update own profile"
  on public.user_profiles for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "users can touch own profile" on public.user_profiles;
create policy "users can touch own profile"
  on public.user_profiles for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "admins can read all profiles" on public.user_profiles;
create policy "admins can read all profiles"
  on public.user_profiles for select to authenticated
  using (exists (
    select 1 from public.admin_users admins where admins.user_id = auth.uid()
  ));

insert into public.user_profiles (user_id, email, signed_up_at, last_seen_at)
select
  users.id,
  users.email,
  users.created_at,
  coalesce(users.last_sign_in_at, users.created_at, now())
from auth.users users
on conflict (user_id) do update
set
  email = excluded.email,
  signed_up_at = least(public.user_profiles.signed_up_at, excluded.signed_up_at),
  last_seen_at = greatest(public.user_profiles.last_seen_at, excluded.last_seen_at);

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (user_id, email, signed_up_at, last_seen_at)
  values (new.id, new.email, coalesce(new.created_at, now()), coalesce(new.last_sign_in_at, new.created_at, now()))
  on conflict (user_id) do update
  set
    email = excluded.email,
    last_seen_at = greatest(public.user_profiles.last_seen_at, excluded.last_seen_at);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert or update of email, last_sign_in_at on auth.users
  for each row execute function public.handle_new_user_profile();

alter table public.global_packs
  add column if not exists icon text,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

grant insert, update, delete on public.global_packs to authenticated;
grant insert, update, delete on public.global_pack_cards to authenticated;

drop policy if exists "admins can create global packs" on public.global_packs;
create policy "admins can create global packs"
  on public.global_packs for insert to authenticated
  with check (exists (
    select 1 from public.admin_users admins where admins.user_id = auth.uid()
  ));

drop policy if exists "admins can update global packs" on public.global_packs;
create policy "admins can update global packs"
  on public.global_packs for update to authenticated
  using (exists (
    select 1 from public.admin_users admins where admins.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.admin_users admins where admins.user_id = auth.uid()
  ));

drop policy if exists "admins can delete global packs" on public.global_packs;
create policy "admins can delete global packs"
  on public.global_packs for delete to authenticated
  using (exists (
    select 1 from public.admin_users admins where admins.user_id = auth.uid()
  ));

drop policy if exists "admins can create global pack cards" on public.global_pack_cards;
create policy "admins can create global pack cards"
  on public.global_pack_cards for insert to authenticated
  with check (exists (
    select 1 from public.admin_users admins where admins.user_id = auth.uid()
  ));

drop policy if exists "admins can update global pack cards" on public.global_pack_cards;
create policy "admins can update global pack cards"
  on public.global_pack_cards for update to authenticated
  using (exists (
    select 1 from public.admin_users admins where admins.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.admin_users admins where admins.user_id = auth.uid()
  ));

drop policy if exists "admins can delete global pack cards" on public.global_pack_cards;
create policy "admins can delete global pack cards"
  on public.global_pack_cards for delete to authenticated
  using (exists (
    select 1 from public.admin_users admins where admins.user_id = auth.uid()
  ));

drop policy if exists "admins can read all events" on public.bishbash_events;
create policy "admins can read all events"
  on public.bishbash_events for select to authenticated
  using (exists (
    select 1 from public.admin_users admins where admins.user_id = auth.uid()
  ));

drop view if exists public.user_summary;
create view public.user_summary as
select
  profiles.user_id,
  profiles.email,
  profiles.signed_up_at,
  greatest(
    profiles.last_seen_at,
    coalesce(max(state.updated_at), profiles.last_seen_at),
    coalesce(max(events.created_at), profiles.last_seen_at)
  ) as last_seen_at,
  count(distinct events.id)::bigint as event_count,
  count(distinct state.user_id)::bigint as has_cloud_state
from public.user_profiles profiles
left join public.bishbash_state state on state.user_id = profiles.user_id
left join public.bishbash_events events on events.user_id = profiles.user_id
group by profiles.user_id, profiles.email, profiles.signed_up_at, profiles.last_seen_at;

grant select on public.user_summary to authenticated;
