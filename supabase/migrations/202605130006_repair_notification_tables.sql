create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  notifications_per_day integer not null default 3,
  timezone text not null default 'Europe/London',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

grant select, insert, update, delete on public.notification_preferences to authenticated;

drop policy if exists "users can manage own notification preferences" on public.notification_preferences;
create policy "users can manage own notification preferences"
  on public.notification_preferences for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "admins can read all notification preferences" on public.notification_preferences;
create policy "admins can read all notification preferences"
  on public.notification_preferences for select to authenticated
  using (exists (
    select 1 from public.admin_users admins where admins.user_id = auth.uid()
  ));

alter table public.notification_delivery_log add column if not exists card_id text;
alter table public.notification_delivery_log add column if not exists card_source text;
alter table public.notification_delivery_log add column if not exists title text;
alter table public.notification_delivery_log add column if not exists body text;

create index if not exists idx_push_subscriptions_user_id on public.push_subscriptions(user_id);
create index if not exists idx_notification_preferences_enabled on public.notification_preferences(enabled);
create index if not exists idx_notification_delivery_log_user_id_sent_at on public.notification_delivery_log(user_id, sent_at);
