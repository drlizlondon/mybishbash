create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

grant select on public.admin_users to authenticated;

drop policy if exists "admins can read own admin row" on public.admin_users;
create policy "admins can read own admin row"
  on public.admin_users for select to authenticated
  using (auth.uid() = user_id);

-- Bootstrap the current project owner as an HQ admin.
insert into public.admin_users (user_id, email)
values ('3fb7946d-0283-4d4c-8156-96c9873b4894', 'lizzies_95@hotmail.co.uk')
on conflict (user_id) do nothing;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text,
  auth text,
  user_agent text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

grant select, insert, update, delete on public.push_subscriptions to authenticated;

drop policy if exists "users can manage own push subscriptions" on public.push_subscriptions;
create policy "users can manage own push subscriptions"
  on public.push_subscriptions for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "admins can read all push subscriptions" on public.push_subscriptions;
create policy "admins can read all push subscriptions"
  on public.push_subscriptions for select to authenticated
  using (exists (
    select 1 from public.admin_users admins where admins.user_id = auth.uid()
  ));

create table if not exists public.notification_delivery_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  delivery_status text not null default 'pending',
  error_message text,
  sent_at timestamptz not null default now(),
  opened_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.notification_delivery_log enable row level security;

grant select, insert, update on public.notification_delivery_log to authenticated;

drop policy if exists "users can read own notification deliveries" on public.notification_delivery_log;
create policy "users can read own notification deliveries"
  on public.notification_delivery_log for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "users can update own notification deliveries" on public.notification_delivery_log;
create policy "users can update own notification deliveries"
  on public.notification_delivery_log for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "admins can read all notification deliveries" on public.notification_delivery_log;
create policy "admins can read all notification deliveries"
  on public.notification_delivery_log for select to authenticated
  using (exists (
    select 1 from public.admin_users admins where admins.user_id = auth.uid()
  ));

create table if not exists public.global_packs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  theme text not null default 'Minimal',
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.global_pack_cards (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.global_packs(id) on delete cascade,
  prompt_text text not null,
  attribution text,
  frequency text not null default 'once_daily',
  timing_windows text[] not null default array['morning', 'day', 'evening'],
  position integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.global_packs enable row level security;
alter table public.global_pack_cards enable row level security;

grant select on public.global_packs to authenticated;
grant select on public.global_pack_cards to authenticated;

drop policy if exists "authenticated users can read published global packs" on public.global_packs;
create policy "authenticated users can read published global packs"
  on public.global_packs for select to authenticated
  using (published = true or exists (
    select 1 from public.admin_users admins where admins.user_id = auth.uid()
  ));

drop policy if exists "authenticated users can read published global pack cards" on public.global_pack_cards;
create policy "authenticated users can read published global pack cards"
  on public.global_pack_cards for select to authenticated
  using (exists (
    select 1
    from public.global_packs packs
    where packs.id = global_pack_cards.pack_id
      and (packs.published = true or exists (
        select 1 from public.admin_users admins where admins.user_id = auth.uid()
      ))
  ));

drop view if exists public.user_summary;
create view public.user_summary as
select
  user_id,
  min(updated_at) as first_seen_at,
  max(updated_at) as last_seen_at
from public.mybishbash_state
where user_id is not null
group by user_id;

drop view if exists public.analytics_summary;
create view public.analytics_summary as
select
  event_type,
  count(*)::bigint as event_count
from public.mybishbash_events
group by event_type;

grant select on public.user_summary to authenticated;
grant select on public.analytics_summary to authenticated;
