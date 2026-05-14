create table if not exists public.launcher_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  anonymous_device_id text,
  session_id text,
  event_type text not null,
  launcher_id text not null,
  launcher_name text,
  launcher_category text,
  route text,
  source text not null default 'fake_launcher',
  is_standalone boolean not null default false,
  app_display_mode text,
  platform text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.launcher_events enable row level security;

grant insert on public.launcher_events to anon, authenticated;
grant select on public.launcher_events to authenticated;

drop policy if exists "anonymous devices can insert launcher events" on public.launcher_events;
create policy "anonymous devices can insert launcher events"
  on public.launcher_events for insert to anon
  with check (user_id is null and anonymous_device_id is not null);

drop policy if exists "users can insert own launcher events" on public.launcher_events;
create policy "users can insert own launcher events"
  on public.launcher_events for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "admins can read launcher events" on public.launcher_events;
create policy "admins can read launcher events"
  on public.launcher_events for select to authenticated
  using (exists (
    select 1 from public.admin_users admins where admins.user_id = auth.uid()
  ));

create index if not exists idx_launcher_events_created_at on public.launcher_events(created_at desc);
create index if not exists idx_launcher_events_launcher_id on public.launcher_events(launcher_id);
create index if not exists idx_launcher_events_event_type on public.launcher_events(event_type);
create index if not exists idx_launcher_events_user_id on public.launcher_events(user_id);
create index if not exists idx_launcher_events_anonymous_device_id on public.launcher_events(anonymous_device_id);
