alter table public.user_profiles
  add column if not exists is_tester boolean not null default false,
  add column if not exists tester_group text,
  add column if not exists tester_enabled_at timestamptz,
  add column if not exists tester_notes text;

alter table public.mybishbash_access_codes
  add column if not exists grants_tester boolean not null default false,
  add column if not exists tester_group text;

drop policy if exists "admins can update all profiles" on public.user_profiles;
create policy "admins can update all profiles"
  on public.user_profiles for update to authenticated
  using (exists (
    select 1 from public.admin_users admins where admins.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.admin_users admins where admins.user_id = auth.uid()
  ));

create table if not exists public.tester_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_type text not null default 'bug',
  title text,
  description text not null,
  expected text,
  actual text,
  severity text not null default 'medium',
  frequency text,
  route text,
  launcher_context text,
  display_mode text,
  device_summary text,
  app_version text,
  diagnostics_json jsonb not null default '{}'::jsonb,
  screenshot_urls text[] not null default '{}',
  status text not null default 'open',
  admin_notes text,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  constraint tester_reports_report_type_check check (report_type in ('bug', 'feedback', 'confusion', 'idea')),
  constraint tester_reports_severity_check check (severity in ('low', 'medium', 'high', 'blocking')),
  constraint tester_reports_status_check check (status in ('open', 'in_review', 'fixed', 'closed', 'not_reproducible'))
);

create table if not exists public.tester_report_attachments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.tester_reports(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  storage_path text not null,
  public_url text,
  mime_type text,
  created_at timestamptz not null default now()
);

alter table public.tester_reports enable row level security;
alter table public.tester_report_attachments enable row level security;

grant select, insert on public.tester_reports to authenticated;
grant update (status, admin_notes, resolved_at, resolved_by, updated_at) on public.tester_reports to authenticated;
grant select, insert on public.tester_report_attachments to authenticated;

drop policy if exists "testers can insert own reports" on public.tester_reports;
create policy "testers can insert own reports"
  on public.tester_reports for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.user_profiles profiles
      where profiles.user_id = auth.uid()
        and profiles.is_tester = true
    )
  );

drop policy if exists "testers can read own reports" on public.tester_reports;
create policy "testers can read own reports"
  on public.tester_reports for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "admins can read all tester reports" on public.tester_reports;
create policy "admins can read all tester reports"
  on public.tester_reports for select to authenticated
  using (exists (
    select 1 from public.admin_users admins where admins.user_id = auth.uid()
  ));

drop policy if exists "admins can update tester reports" on public.tester_reports;
create policy "admins can update tester reports"
  on public.tester_reports for update to authenticated
  using (exists (
    select 1 from public.admin_users admins where admins.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.admin_users admins where admins.user_id = auth.uid()
  ));

drop policy if exists "testers can insert own attachments" on public.tester_report_attachments;
create policy "testers can insert own attachments"
  on public.tester_report_attachments for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.tester_reports reports
      where reports.id = tester_report_attachments.report_id
        and reports.user_id = auth.uid()
    )
  );

drop policy if exists "testers can read own attachments" on public.tester_report_attachments;
create policy "testers can read own attachments"
  on public.tester_report_attachments for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "admins can read all tester attachments" on public.tester_report_attachments;
create policy "admins can read all tester attachments"
  on public.tester_report_attachments for select to authenticated
  using (exists (
    select 1 from public.admin_users admins where admins.user_id = auth.uid()
  ));

create index if not exists tester_reports_created_at_idx on public.tester_reports(created_at desc);
create index if not exists tester_reports_user_id_idx on public.tester_reports(user_id);
create index if not exists tester_reports_status_idx on public.tester_reports(status);
create index if not exists tester_reports_launcher_context_idx on public.tester_reports(launcher_context);

insert into storage.buckets (id, name, public)
values ('tester-report-uploads', 'tester-report-uploads', false)
on conflict (id) do nothing;

drop policy if exists "testers can upload own tester report files" on storage.objects;
create policy "testers can upload own tester report files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'tester-report-uploads'
    and split_part(name, '/', 1) = auth.uid()::text
    and exists (
      select 1 from public.user_profiles profiles
      where profiles.user_id = auth.uid()
        and profiles.is_tester = true
    )
  );

drop policy if exists "testers can read own tester report files" on storage.objects;
create policy "testers can read own tester report files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'tester-report-uploads'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "admins can read all tester report files" on storage.objects;
create policy "admins can read all tester report files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'tester-report-uploads'
    and exists (
      select 1 from public.admin_users admins where admins.user_id = auth.uid()
    )
  );

create or replace function public.claim_mybishbash_access_code(access_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_code text;
  matched_grants_tester boolean;
  matched_tester_group text;
begin
  select codes.code, codes.grants_tester, codes.tester_group
  into matched_code, matched_grants_tester, matched_tester_group
  from public.mybishbash_access_codes codes
  where public.normalize_mybishbash_access_code(codes.code) = public.normalize_mybishbash_access_code(access_code)
    and codes.active = true
    and (codes.max_uses is null or codes.use_count < codes.max_uses)
  for update;

  if matched_code is null then
    return false;
  end if;

  update public.mybishbash_access_codes
  set
    use_count = use_count + 1,
    claimed_at = now()
  where code = matched_code;

  insert into public.user_profiles (
    user_id,
    email,
    has_access,
    access_code,
    access_code_claimed_at,
    signed_up_at,
    last_seen_at,
    is_tester,
    tester_group,
    tester_enabled_at
  )
  values (
    auth.uid(),
    auth.jwt() ->> 'email',
    true,
    matched_code,
    now(),
    now(),
    now(),
    coalesce(matched_grants_tester, false),
    matched_tester_group,
    case when coalesce(matched_grants_tester, false) then now() else null end
  )
  on conflict (user_id) do update
  set
    email = coalesce(excluded.email, public.user_profiles.email),
    has_access = true,
    access_code = coalesce(public.user_profiles.access_code, matched_code),
    access_code_claimed_at = coalesce(public.user_profiles.access_code_claimed_at, now()),
    last_seen_at = now(),
    is_tester = public.user_profiles.is_tester or excluded.is_tester,
    tester_group = coalesce(excluded.tester_group, public.user_profiles.tester_group),
    tester_enabled_at = coalesce(public.user_profiles.tester_enabled_at, excluded.tester_enabled_at);

  return true;
end;
$$;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  metadata_access_code text;
  matched_code text;
  matched_grants_tester boolean;
  matched_tester_group text;
begin
  metadata_access_code := public.normalize_mybishbash_access_code(new.raw_user_meta_data ->> 'mybishbash_access_code');

  if metadata_access_code <> '' then
    select codes.code, codes.grants_tester, codes.tester_group
    into matched_code, matched_grants_tester, matched_tester_group
    from public.mybishbash_access_codes codes
    where public.normalize_mybishbash_access_code(codes.code) = metadata_access_code
      and codes.active = true
      and (codes.max_uses is null or codes.use_count < codes.max_uses)
    limit 1;
  end if;

  insert into public.user_profiles (
    user_id,
    email,
    signed_up_at,
    last_seen_at,
    has_access,
    access_code,
    access_code_claimed_at,
    is_tester,
    tester_group,
    tester_enabled_at
  )
  values (
    new.id,
    new.email,
    coalesce(new.created_at, now()),
    coalesce(new.last_sign_in_at, new.created_at, now()),
    matched_code is not null,
    matched_code,
    case when matched_code is not null then now() else null end,
    coalesce(matched_grants_tester, false),
    matched_tester_group,
    case when coalesce(matched_grants_tester, false) then now() else null end
  )
  on conflict (user_id) do update
  set
    email = excluded.email,
    last_seen_at = greatest(public.user_profiles.last_seen_at, excluded.last_seen_at),
    has_access = public.user_profiles.has_access or excluded.has_access,
    access_code = coalesce(public.user_profiles.access_code, excluded.access_code),
    access_code_claimed_at = coalesce(public.user_profiles.access_code_claimed_at, excluded.access_code_claimed_at),
    is_tester = public.user_profiles.is_tester or excluded.is_tester,
    tester_group = coalesce(excluded.tester_group, public.user_profiles.tester_group),
    tester_enabled_at = coalesce(public.user_profiles.tester_enabled_at, excluded.tester_enabled_at);

  return new;
end;
$$;

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
  count(distinct state.user_id)::bigint as has_cloud_state,
  profiles.is_tester,
  profiles.tester_group,
  profiles.tester_enabled_at,
  profiles.tester_notes
from public.user_profiles profiles
left join public.mybishbash_state state on state.user_id = profiles.user_id
left join public.mybishbash_events events on events.user_id = profiles.user_id
group by profiles.user_id, profiles.email, profiles.signed_up_at, profiles.last_seen_at, profiles.is_tester, profiles.tester_group, profiles.tester_enabled_at, profiles.tester_notes;

grant select on public.user_summary to authenticated;
