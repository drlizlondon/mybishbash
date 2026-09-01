-- Extend hq_launcher_configs so HQ is the global control layer for launcher
-- availability, destination links, icon and interruption-pack configuration.
-- The client stays backwards-compatible if this migration has not been applied.

alter table public.hq_launcher_configs
  add column if not exists availability_status text not null default 'public'
    check (availability_status in ('public', 'hidden', 'experimental', 'tester_only', 'disabled')),
  add column if not exists ios_web_fallback_url text,
  add column if not exists android_web_fallback_url text,
  add column if not exists native_app_url text,
  add column if not exists app_url text,
  add column if not exists manual_url text,
  add column if not exists default_interruption_pack_id text,
  add column if not exists qa_notes text;

-- Backfill availability from the legacy enabled flag:
-- enabled = true was "live for users" (public); enabled = false was
-- "not live for users but still reviewable in HQ" (disabled).
-- Only rows still carrying the column default are backfilled, so re-running
-- the migration never clobbers an admin-curated status.
update public.hq_launcher_configs
set availability_status = 'disabled'
where availability_status = 'public' and enabled = false;

comment on column public.hq_launcher_configs.availability_status is
  'public: visible to normal eligible users; hidden: HQ-only; experimental: tester/experimental flows; tester_only: testers; disabled: unavailable to users, still visible in HQ.';
comment on column public.hq_launcher_configs.qa_notes is
  'Free-form QA/testing notes shown in the HQ launcher card.';
