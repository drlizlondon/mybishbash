create table if not exists public.hq_launcher_configs (
  launcher_id text primary key,
  display_name text,
  real_app_label text,
  icon_src text,
  uploaded_icon_url text,
  enabled boolean not null default true,
  hq_visible boolean not null default true,
  ios_app_url text,
  android_intent_url text,
  web_fallback_url text,
  use_interruption_pack boolean not null default true,
  interruption_pack_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.hq_launcher_configs enable row level security;

grant select on public.hq_launcher_configs to anon, authenticated;
grant insert, update on public.hq_launcher_configs to authenticated;

drop policy if exists "public can read launcher configs" on public.hq_launcher_configs;
create policy "public can read launcher configs"
  on public.hq_launcher_configs for select
  using (true);

drop policy if exists "admins can create launcher configs" on public.hq_launcher_configs;
create policy "admins can create launcher configs"
  on public.hq_launcher_configs for insert to authenticated
  with check (exists (
    select 1 from public.admin_users admins where admins.user_id = auth.uid()
  ));

drop policy if exists "admins can update launcher configs" on public.hq_launcher_configs;
create policy "admins can update launcher configs"
  on public.hq_launcher_configs for update to authenticated
  using (exists (
    select 1 from public.admin_users admins where admins.user_id = auth.uid()
  ))
  with check (exists (
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
  max(events.created_at) filter (
    where events.event_type is not null
      and events.event_type <> 'intercept_card_viewed'
  ) as last_meaningful_activity_at,
  count(distinct events.id)::bigint as event_count,
  count(distinct state.user_id)::bigint as has_cloud_state,
  profiles.has_access,
  profiles.access_code,
  profiles.access_code_claimed_at,
  profiles.is_tester,
  profiles.tester_group,
  profiles.tester_enabled_at,
  profiles.tester_notes
from public.user_profiles profiles
left join public.mybishbash_state state on state.user_id = profiles.user_id
left join public.mybishbash_events events on events.user_id = profiles.user_id
group by
  profiles.user_id,
  profiles.email,
  profiles.signed_up_at,
  profiles.last_seen_at,
  profiles.has_access,
  profiles.access_code,
  profiles.access_code_claimed_at,
  profiles.is_tester,
  profiles.tester_group,
  profiles.tester_enabled_at,
  profiles.tester_notes;

grant select on public.user_summary to authenticated;
