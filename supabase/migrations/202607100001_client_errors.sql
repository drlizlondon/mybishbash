-- Client error telemetry (Phase 1). Unhandled errors only — no analytics.
-- Reports are scrubbed client-side; this table must never receive tokens,
-- emails, access codes or user content.
create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  release text,
  source_sha text,
  platform text,
  route text,
  kind text not null,
  message text not null,
  stack text,
  user_agent text,
  count integer not null default 1
);

alter table public.client_errors enable row level security;

drop policy if exists "users can insert their own error reports" on public.client_errors;
create policy "users can insert their own error reports"
  on public.client_errors
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "admins can read client errors" on public.client_errors;
create policy "admins can read client errors"
  on public.client_errors
  for select
  to authenticated
  using (
    exists (select 1 from public.admin_users admins where admins.user_id = auth.uid())
  );

create index if not exists client_errors_occurred_at_idx
  on public.client_errors (occurred_at desc);
create index if not exists client_errors_user_id_idx
  on public.client_errors (user_id);
