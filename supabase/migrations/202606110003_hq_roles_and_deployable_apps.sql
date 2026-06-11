-- HQ role model + deployable HQ-created apps.
--
-- Roles: owner (full control, only role allowed to hard-delete custom apps),
-- admin (add/edit/test/archive apps), analyst (view only), support (reports/
-- testing notes). Existing admin_users rows default to 'admin'; promote the
-- CEO row to 'owner' manually:
--   update public.admin_users set role = 'owner' where email = '<ceo email>';

alter table public.admin_users
  add column if not exists role text not null default 'admin'
    check (role in ('owner', 'admin', 'analyst', 'support'));

comment on column public.admin_users.role is
  'owner: full control incl. hard delete; admin: manage apps/packs; analyst: view only; support: reports and testing notes.';

-- Launcher config writes are restricted to owner/admin (analyst/support keep
-- read access via the existing select grant/policy).
drop policy if exists "admins can create launcher configs" on public.hq_launcher_configs;
create policy "admins can create launcher configs"
  on public.hq_launcher_configs for insert to authenticated
  with check (exists (
    select 1 from public.admin_users admins
    where admins.user_id = auth.uid() and admins.role in ('owner', 'admin')
  ));

drop policy if exists "admins can update launcher configs" on public.hq_launcher_configs;
create policy "admins can update launcher configs"
  on public.hq_launcher_configs for update to authenticated
  using (exists (
    select 1 from public.admin_users admins
    where admins.user_id = auth.uid() and admins.role in ('owner', 'admin')
  ))
  with check (exists (
    select 1 from public.admin_users admins
    where admins.user_id = auth.uid() and admins.role in ('owner', 'admin')
  ));

-- Hard delete of HQ-created apps is owner-only (replaces the broader policy
-- from the previous migration).
drop policy if exists "admins can delete custom launcher configs" on public.hq_launcher_configs;
create policy "owner can delete custom launcher configs"
  on public.hq_launcher_configs for delete to authenticated
  using (
    is_custom = true
    and exists (
      select 1 from public.admin_users admins
      where admins.user_id = auth.uid() and admins.role = 'owner'
    )
  );

-- Icon uploads restricted to owner/admin.
drop policy if exists "admins can upload launcher icons" on storage.objects;
create policy "admins can upload launcher icons"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'launcher-icons'
    and exists (
      select 1 from public.admin_users admins
      where admins.user_id = auth.uid() and admins.role in ('owner', 'admin')
    )
  );

drop policy if exists "admins can update launcher icons" on storage.objects;
create policy "admins can update launcher icons"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'launcher-icons'
    and exists (
      select 1 from public.admin_users admins
      where admins.user_id = auth.uid() and admins.role in ('owner', 'admin')
    )
  );

-- Rollout scaffold: gradual deployment beyond status-based audiences
-- (internal -> testers -> all users). Percentage rollout is modelled but not
-- yet enforced by the client. TODO(client): bucket anonymous_device_id into
-- [0,100) and show public launchers only when bucket < rollout_percent.
alter table public.hq_launcher_configs
  add column if not exists rollout_percent integer
    check (rollout_percent is null or (rollout_percent >= 0 and rollout_percent <= 100));

comment on column public.hq_launcher_configs.rollout_percent is
  'Scaffold for percentage rollout of public launchers. NULL = 100%. Not yet enforced by the client.';
