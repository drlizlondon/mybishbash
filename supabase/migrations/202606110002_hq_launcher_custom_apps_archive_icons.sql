-- HQ launcher hardening: archive/draft lifecycle states, HQ-created (custom)
-- app rows, admin delete for custom rows only, and a public storage bucket for
-- HQ-uploaded launcher icons.

-- 0. Safety: ensure the availability columns exist even if migration
-- 202606110001 has not been applied to this database (add column if not
-- exists is a no-op when it has). Mirrors that migration's column set,
-- including its enabled→availability backfill.
alter table public.hq_launcher_configs
  add column if not exists availability_status text not null default 'public',
  add column if not exists ios_web_fallback_url text,
  add column if not exists android_web_fallback_url text,
  add column if not exists native_app_url text,
  add column if not exists app_url text,
  add column if not exists manual_url text,
  add column if not exists default_interruption_pack_id text,
  add column if not exists qa_notes text;

update public.hq_launcher_configs
set availability_status = 'disabled'
where availability_status = 'public' and enabled = false;

-- 1. Extend the availability vocabulary with draft + archived.
alter table public.hq_launcher_configs
  drop constraint if exists hq_launcher_configs_availability_status_check;
alter table public.hq_launcher_configs
  add constraint hq_launcher_configs_availability_status_check
  check (availability_status in ('public', 'hidden', 'experimental', 'tester_only', 'disabled', 'draft', 'archived'));

comment on column public.hq_launcher_configs.availability_status is
  'public: live for all users; tester_only/experimental: testers; hidden/draft: HQ-only; disabled: unavailable to users, reviewable in HQ; archived: retired, historical data preserved.';

-- 2. HQ-created apps. is_custom marks rows whose launcher_id is not part of
-- the static code-reviewed registry. They stay admin-only drafts until the ID
-- ships in src/lib/launcherRegistry.js through a reviewed release.
alter table public.hq_launcher_configs
  add column if not exists is_custom boolean not null default false,
  add column if not exists category text;

comment on column public.hq_launcher_configs.is_custom is
  'True for HQ-created app rows (not overrides of static registry IDs). Custom apps are clamped to admin-only availability until promoted into the code registry.';

-- 3. Admins may permanently delete custom rows only. Static registry
-- overrides are never deletable from the client (archive instead).
grant delete on public.hq_launcher_configs to authenticated;

drop policy if exists "admins can delete custom launcher configs" on public.hq_launcher_configs;
create policy "admins can delete custom launcher configs"
  on public.hq_launcher_configs for delete to authenticated
  using (
    is_custom = true
    and exists (
      select 1 from public.admin_users admins where admins.user_id = auth.uid()
    )
  );

-- 4. Public storage bucket for HQ-uploaded launcher icons. Public read so
-- fake launcher buttons, install pages and manifests can reference the URL;
-- writes restricted to admins.
insert into storage.buckets (id, name, public)
values ('launcher-icons', 'launcher-icons', true)
on conflict (id) do nothing;

drop policy if exists "public can read launcher icons" on storage.objects;
create policy "public can read launcher icons"
  on storage.objects for select
  using (bucket_id = 'launcher-icons');

drop policy if exists "admins can upload launcher icons" on storage.objects;
create policy "admins can upload launcher icons"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'launcher-icons'
    and exists (
      select 1 from public.admin_users admins where admins.user_id = auth.uid()
    )
  );

drop policy if exists "admins can update launcher icons" on storage.objects;
create policy "admins can update launcher icons"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'launcher-icons'
    and exists (
      select 1 from public.admin_users admins where admins.user_id = auth.uid()
    )
  );
