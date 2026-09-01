-- Forward rollback for 202606120001_access_tiers_grants_audit.sql
--
-- Lives OUTSIDE supabase/migrations on purpose: `supabase db push` must never
-- apply this automatically. Paste sections into the Supabase SQL editor (or
-- run via psql) only if rolling back.
--
-- Design: 202606120001 modifies NO pre-existing data, so rollback is purely
-- about restoring prior behaviour. Sections are ordered by urgency — section
-- 1 alone resolves a login outage. Later sections are cleanup and are safe to
-- skip. Nothing here touches existing user data except the explicitly marked
-- OPTIONAL blocks.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. EMERGENCY: restore the previous login/signup trigger function.
--    (The trigger on auth.users fires on every login; this is the only part
--    of the migration on the login path.) Verbatim from 202605250001.
-- ═══════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Restore the previous signup RPC bodies (signatures unchanged).
--    Verbatim from 202605250001.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.validate_mybishbash_access_code(access_code text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.mybishbash_access_codes codes
    where public.normalize_mybishbash_access_code(codes.code) = public.normalize_mybishbash_access_code(access_code)
      and codes.active = true
      and (codes.max_uses is null or codes.use_count < codes.max_uses)
  );
$$;

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
    claimed_at = now(),
    active = case
      when max_uses is not null and use_count + 1 >= max_uses then false
      else active
    end
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Restore prior grants/policies on user_profiles.
--    NOTE: the broad update grant below faithfully restores the pre-migration
--    state, INCLUDING its known hole (clients could update their own access
--    columns). Only restore it if HQ profile editing breaks; otherwise the
--    column-limited grants from the migration are strictly safer to keep.
-- ═══════════════════════════════════════════════════════════════════════════

-- grant update on public.user_profiles to authenticated;
-- grant insert on public.user_profiles to authenticated;

drop policy if exists "admins can update all profiles" on public.user_profiles;
create policy "admins can update all profiles"
  on public.user_profiles for update to authenticated
  using (exists (
    select 1 from public.admin_users admins where admins.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.admin_users admins where admins.user_id = auth.uid()
  ));

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Remove the new HQ access RPC surface (no callers in the old client).
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.hq_set_user_access(text, boolean, text, timestamptz, text, text);
drop function if exists public.hq_create_access_code(text, text, integer, text, text, text, integer, timestamptz, boolean, text);
drop function if exists public.hq_set_access_code_active(text, boolean);
drop function if exists public.hq_set_tester_status(uuid, boolean, text, text);
drop function if exists public.has_active_access(uuid);
drop function if exists public.is_hq_access_admin();
drop function if exists public.normalize_access_email(text);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Remove the new tables. Drops only objects this migration created;
--    access_audit_log contents are audit rows generated since the migration.
-- ═══════════════════════════════════════════════════════════════════════════

drop table if exists public.pending_access_grants;
drop table if exists public.access_audit_log;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. OPTIONAL: deactivate the seeded legacy codes.
--    Skip if rows for these codes existed before the migration (they may be
--    load-bearing for current signups). Deactivation, never deletion.
-- ═══════════════════════════════════════════════════════════════════════════

-- update public.mybishbash_access_codes
-- set active = false
-- where code in ('REDDIT-14', 'FAMILY-ALPHA', 'FOUNDER-EARLY', 'TESTER')
--   and label = 'Legacy hardcoded client code';

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. OPTIONAL + DESTRUCTIVE TO NEW DATA ONLY: drop the new columns.
--    Removes tier/grant metadata written since the migration (including the
--    founding-cohort backfill). No pre-existing column is touched. Leaving
--    these in place is harmless — the old client never reads them.
-- ═══════════════════════════════════════════════════════════════════════════

-- alter table public.user_profiles
--   drop column if exists access_tier,
--   drop column if exists access_expires_at,
--   drop column if exists grant_reason,
--   drop column if exists cohort,
--   drop column if exists access_source,
--   drop column if exists stripe_customer_id;
--
-- alter table public.mybishbash_access_codes
--   drop column if exists grants_tier,
--   drop column if exists grant_reason,
--   drop column if exists cohort,
--   drop column if exists grants_duration_days,
--   drop column if exists expires_at,
--   drop column if exists label,
--   drop column if exists created_by;
