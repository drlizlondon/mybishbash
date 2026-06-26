-- Access refactor: three separated concepts.
--
--   1. Access codes  — the door into the gated rollout. A code grants a
--      membership (free|founder|premium), may flag tester, and may carry
--      optional per-account entitlement overrides.
--   2. Membership    — commercial entitlement only: free|founder|premium.
--   3. Entitlements  — resolved limits/flags. Defaults live in JS
--      (src/lib/accessCapabilities.js); per-account overrides live in
--      user_profiles.entitlement_overrides (jsonb).
--
-- tester (is_tester) and admin (admin_users) stay ORTHOGONAL to membership.
-- `access_tier` (free|premium) is kept as a legacy mirror so has_active_access()
-- and existing SQL keep working; every write path sets it from membership.

-- ── membership rank helper (free < founder <= premium) ──────────────────────

create or replace function public.membership_rank(membership text)
returns integer
language sql
immutable
as $$
  select case membership
    when 'premium' then 2
    when 'founder' then 1
    else 0
  end;
$$;

-- access_tier mirror for a membership.
create or replace function public.membership_access_tier(membership text)
returns text
language sql
immutable
as $$
  select case when membership in ('founder', 'premium') then 'premium' else 'free' end;
$$;

-- ── user_profiles: membership + entitlement overrides ───────────────────────

alter table public.user_profiles
  add column if not exists membership text not null default 'free'
    check (membership in ('free', 'founder', 'premium')),
  add column if not exists entitlement_overrides jsonb;

comment on column public.user_profiles.membership is
  'Commercial entitlement only: free|founder|premium. Orthogonal to is_tester and admin_users.';
comment on column public.user_profiles.entitlement_overrides is
  'Optional per-account entitlement overrides merged over the membership defaults (jsonb).';

-- Backfill membership from the legacy tier + founding metadata.
update public.user_profiles
set membership = case
  when access_tier = 'premium' and (grant_reason = 'founder' or cohort = 'founding-2026') then 'founder'
  when access_tier = 'premium' then 'premium'
  else 'free'
end
where membership = 'free';

-- ── access codes: grant a membership, not "premium" ─────────────────────────

alter table public.mybishbash_access_codes
  add column if not exists grants_membership text not null default 'premium'
    check (grants_membership in ('free', 'founder', 'premium')),
  add column if not exists entitlement_overrides jsonb;

comment on column public.mybishbash_access_codes.grants_membership is
  'Membership granted on claim/signup: free|founder|premium. A free code still grants entry (has_access).';
comment on column public.mybishbash_access_codes.entitlement_overrides is
  'Optional entitlement overrides stamped onto the profile when the code is claimed.';

-- Backfill from the legacy grants_tier.
update public.mybishbash_access_codes
set grants_membership = case
  when grants_tier = 'premium' then 'premium'
  else 'free'
end
where grants_membership = 'premium' and grants_tier is distinct from 'premium';

-- ── pending grants: carry membership + overrides ────────────────────────────

alter table public.pending_access_grants
  add column if not exists membership text not null default 'premium'
    check (membership in ('free', 'founder', 'premium')),
  add column if not exists entitlement_overrides jsonb;

update public.pending_access_grants
set membership = case when access_tier = 'premium' then 'premium' else 'free' end
where membership = 'premium' and access_tier is distinct from 'premium';

-- ── HQ: create access codes (membership-aware) ──────────────────────────────

create or replace function public.hq_create_access_code(
  p_code text,
  p_label text default null,
  p_max_uses integer default null,
  p_grants_membership text default 'premium',
  p_grant_reason text default null,
  p_cohort text default null,
  p_grants_duration_days integer default null,
  p_expires_at timestamptz default null,
  p_grants_tester boolean default false,
  p_tester_group text default null,
  p_entitlement_overrides jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_email text;
  normalized_code text;
begin
  select admins.email into admin_email
  from public.admin_users admins
  where admins.user_id = auth.uid() and admins.role in ('owner', 'admin');

  if admin_email is null then
    raise exception 'Only owner/admin HQ roles can create access codes';
  end if;

  if p_grants_membership not in ('free', 'founder', 'premium') then
    raise exception 'Invalid membership %', p_grants_membership;
  end if;

  normalized_code := public.normalize_mybishbash_access_code(p_code);
  if normalized_code = '' then
    raise exception 'A code is required';
  end if;

  insert into public.mybishbash_access_codes (
    code, active, max_uses, grants_membership, grants_tier, grant_reason, cohort,
    grants_duration_days, expires_at, label, grants_tester, tester_group,
    entitlement_overrides, created_by
  )
  values (
    normalized_code, true, p_max_uses, p_grants_membership,
    public.membership_access_tier(p_grants_membership), p_grant_reason, p_cohort,
    p_grants_duration_days, p_expires_at, p_label, coalesce(p_grants_tester, false),
    p_tester_group, p_entitlement_overrides, auth.uid()
  );

  insert into public.access_audit_log (email, changed_by, action, new_values, reason, expires_at)
  values (
    null,
    admin_email,
    'code_created',
    jsonb_build_object(
      'code', normalized_code,
      'label', p_label,
      'max_uses', p_max_uses,
      'grants_membership', p_grants_membership,
      'grant_reason', p_grant_reason,
      'cohort', p_cohort,
      'grants_duration_days', p_grants_duration_days,
      'grants_tester', coalesce(p_grants_tester, false),
      'entitlement_overrides', p_entitlement_overrides
    ),
    p_grant_reason,
    p_expires_at
  );

  return jsonb_build_object('status', 'created', 'code', normalized_code);
end;
$$;

revoke execute on function public.hq_create_access_code(text, text, integer, text, text, text, integer, timestamptz, boolean, text, jsonb) from public;
grant execute on function public.hq_create_access_code(text, text, integer, text, text, text, integer, timestamptz, boolean, text, jsonb) to authenticated;

-- Drop the prior 10-arg signature so callers move to the membership-aware one.
drop function if exists public.hq_create_access_code(text, text, integer, text, text, text, integer, timestamptz, boolean, text);

-- ── HQ: grant / revoke membership by email (orthogonal tester) ──────────────

create or replace function public.hq_set_user_access(
  p_email text,
  p_grant boolean,
  p_membership text default 'premium',
  p_expires_at timestamptz default null,
  p_reason text default null,
  p_cohort text default null,
  p_is_tester boolean default null,
  p_tester_group text default null,
  p_entitlement_overrides jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_email text;
  normalized_email text;
  target public.user_profiles%rowtype;
  effective_membership text;
  old_values jsonb;
  new_values jsonb;
  outcome text;
begin
  select admins.email into admin_email
  from public.admin_users admins
  where admins.user_id = auth.uid() and admins.role in ('owner', 'admin');

  if admin_email is null then
    raise exception 'Only owner/admin HQ roles can manage access';
  end if;

  if p_membership not in ('free', 'founder', 'premium') then
    raise exception 'Invalid membership %', p_membership;
  end if;

  normalized_email := public.normalize_access_email(p_email);
  if normalized_email = '' then
    raise exception 'An email address is required';
  end if;

  -- Revoke drops both entry and membership to free.
  effective_membership := case when p_grant then p_membership else 'free' end;

  select * into target
  from public.user_profiles profiles
  where public.normalize_access_email(profiles.email) = normalized_email
  limit 1;

  if target.user_id is not null then
    old_values := jsonb_build_object(
      'has_access', target.has_access,
      'membership', target.membership,
      'access_expires_at', target.access_expires_at,
      'is_tester', target.is_tester
    );

    update public.user_profiles profiles
    set
      has_access = p_grant,
      membership = effective_membership,
      access_tier = public.membership_access_tier(effective_membership),
      access_expires_at = case when p_grant then p_expires_at else null end,
      grant_reason = case when p_grant then coalesce(p_reason, profiles.grant_reason) else profiles.grant_reason end,
      cohort = coalesce(p_cohort, profiles.cohort),
      access_source = 'hq_grant',
      entitlement_overrides = coalesce(p_entitlement_overrides, profiles.entitlement_overrides),
      is_tester = coalesce(p_is_tester, profiles.is_tester),
      tester_group = case
        when p_is_tester is true then coalesce(nullif(trim(coalesce(p_tester_group, '')), ''), profiles.tester_group)
        when p_is_tester is false then null
        else profiles.tester_group
      end,
      tester_enabled_at = case
        when p_is_tester is true then coalesce(profiles.tester_enabled_at, now())
        when p_is_tester is false then null
        else profiles.tester_enabled_at
      end
    where profiles.user_id = target.user_id;

    outcome := 'updated';
  else
    insert into public.pending_access_grants (
      normalized_email, has_access, access_tier, membership, access_expires_at,
      grant_reason, cohort, set_tester, tester_group, entitlement_overrides,
      created_by, updated_at
    )
    values (
      normalized_email, p_grant, public.membership_access_tier(effective_membership),
      effective_membership, case when p_grant then p_expires_at else null end,
      p_reason, p_cohort, p_is_tester, p_tester_group, p_entitlement_overrides,
      auth.uid(), now()
    )
    on conflict (normalized_email) do update
    set
      has_access = excluded.has_access,
      access_tier = excluded.access_tier,
      membership = excluded.membership,
      access_expires_at = excluded.access_expires_at,
      grant_reason = coalesce(excluded.grant_reason, public.pending_access_grants.grant_reason),
      cohort = coalesce(excluded.cohort, public.pending_access_grants.cohort),
      set_tester = coalesce(excluded.set_tester, public.pending_access_grants.set_tester),
      tester_group = coalesce(excluded.tester_group, public.pending_access_grants.tester_group),
      entitlement_overrides = coalesce(excluded.entitlement_overrides, public.pending_access_grants.entitlement_overrides),
      created_by = excluded.created_by,
      updated_at = now(),
      applied_at = null,
      applied_user_id = null;

    outcome := 'pending';
  end if;

  new_values := jsonb_build_object(
    'has_access', p_grant,
    'membership', effective_membership,
    'access_expires_at', case when p_grant then p_expires_at else null end,
    'is_tester', p_is_tester
  );

  insert into public.access_audit_log (user_id, email, changed_by, action, old_values, new_values, reason, expires_at)
  values (
    target.user_id,
    normalized_email,
    admin_email,
    case
      when not p_grant then 'revoke'
      when outcome = 'pending' then 'grant_pending'
      else 'grant'
    end,
    old_values,
    new_values,
    p_reason,
    p_expires_at
  );

  return jsonb_build_object('status', outcome, 'email', normalized_email);
end;
$$;

revoke execute on function public.hq_set_user_access(text, boolean, text, timestamptz, text, text, boolean, text, jsonb) from public;
grant execute on function public.hq_set_user_access(text, boolean, text, timestamptz, text, text, boolean, text, jsonb) to authenticated;

-- Drop the prior 6-arg signature.
drop function if exists public.hq_set_user_access(text, boolean, text, timestamptz, text, text);

-- ── claim RPC: stamp membership + overrides (signature unchanged) ───────────

create or replace function public.claim_mybishbash_access_code(access_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  matched public.mybishbash_access_codes%rowtype;
  granted_membership text;
  granted_expires_at timestamptz;
begin
  select codes.* into matched
  from public.mybishbash_access_codes codes
  where public.normalize_mybishbash_access_code(codes.code) = public.normalize_mybishbash_access_code(access_code)
    and codes.active = true
    and (codes.max_uses is null or codes.use_count < codes.max_uses)
    and (codes.expires_at is null or codes.expires_at > now())
  for update;

  if matched.code is null then
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
  where code = matched.code;

  granted_membership := coalesce(matched.grants_membership, 'premium');
  granted_expires_at := case
    when matched.grants_duration_days is not null then now() + make_interval(days => matched.grants_duration_days)
    else null
  end;

  insert into public.user_profiles (
    user_id, email, has_access, access_code, access_code_claimed_at,
    signed_up_at, last_seen_at, membership, access_tier, access_expires_at,
    grant_reason, cohort, access_source, entitlement_overrides,
    is_tester, tester_group, tester_enabled_at
  )
  values (
    auth.uid(),
    auth.jwt() ->> 'email',
    true,
    matched.code,
    now(),
    now(),
    now(),
    granted_membership,
    public.membership_access_tier(granted_membership),
    granted_expires_at,
    matched.grant_reason,
    matched.cohort,
    'access_code',
    matched.entitlement_overrides,
    coalesce(matched.grants_tester, false),
    matched.tester_group,
    case when coalesce(matched.grants_tester, false) then now() else null end
  )
  on conflict (user_id) do update
  set
    email = coalesce(excluded.email, public.user_profiles.email),
    has_access = true,
    access_code = coalesce(public.user_profiles.access_code, matched.code),
    access_code_claimed_at = coalesce(public.user_profiles.access_code_claimed_at, now()),
    last_seen_at = now(),
    -- Membership never downgrades on re-claim; take the higher rank.
    membership = case
      when public.membership_rank(public.user_profiles.membership) >= public.membership_rank(excluded.membership)
        then public.user_profiles.membership
      else excluded.membership
    end,
    access_tier = public.membership_access_tier(case
      when public.membership_rank(public.user_profiles.membership) >= public.membership_rank(excluded.membership)
        then public.user_profiles.membership
      else excluded.membership
    end),
    access_expires_at = case
      when public.membership_rank(public.user_profiles.membership) >= public.membership_rank(excluded.membership)
        and public.user_profiles.access_expires_at is null then null
      when excluded.access_expires_at is null then null
      else greatest(coalesce(public.user_profiles.access_expires_at, excluded.access_expires_at), excluded.access_expires_at)
    end,
    grant_reason = coalesce(public.user_profiles.grant_reason, excluded.grant_reason),
    cohort = coalesce(public.user_profiles.cohort, excluded.cohort),
    access_source = coalesce(public.user_profiles.access_source, 'access_code'),
    entitlement_overrides = coalesce(public.user_profiles.entitlement_overrides, excluded.entitlement_overrides),
    is_tester = public.user_profiles.is_tester or excluded.is_tester,
    tester_group = coalesce(excluded.tester_group, public.user_profiles.tester_group),
    tester_enabled_at = coalesce(public.user_profiles.tester_enabled_at, excluded.tester_enabled_at);

  insert into public.access_audit_log (user_id, email, changed_by, action, new_values, reason, expires_at)
  values (
    auth.uid(),
    auth.jwt() ->> 'email',
    'system:code_claim',
    'grant',
    jsonb_build_object(
      'has_access', true,
      'membership', granted_membership,
      'access_expires_at', granted_expires_at,
      'access_code', matched.code,
      'grant_reason', matched.grant_reason,
      'cohort', matched.cohort
    ),
    matched.grant_reason,
    granted_expires_at
  );

  return true;
end;
$$;

-- ── signup handoff redemption: the REAL signup path stamps membership ───────
--
-- signUp() passes mybishbash_signup_handoff_ref (not the raw code), so this
-- function — invoked first by the trigger below — is what actually creates the
-- profile at signup. It must set membership/entitlement_overrides, not just the
-- legacy access_tier. (Mirrors 202606190001 with membership added.)

create or replace function public.redeem_mybishbash_signup_handoff(
  p_handoff_ref text,
  p_user_id uuid default auth.uid(),
  p_email text default (auth.jwt() ->> 'email')
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  handoff public.mybishbash_signup_handoffs%rowtype;
  matched public.mybishbash_access_codes%rowtype;
  granted_membership text;
  granted_expires_at timestamptz;
begin
  if nullif(trim(coalesce(p_handoff_ref, '')), '') is null or p_user_id is null then
    return false;
  end if;

  select handoffs.* into handoff
  from public.mybishbash_signup_handoffs handoffs
  where handoffs.handoff_ref = trim(p_handoff_ref)
    and handoffs.claimed_at is null
    and handoffs.expires_at > now()
  for update;

  if handoff.id is null then
    return false;
  end if;

  select codes.* into matched
  from public.mybishbash_access_codes codes
  where public.normalize_mybishbash_access_code(codes.code) = public.normalize_mybishbash_access_code(handoff.access_code)
    and codes.active = true
    and (codes.max_uses is null or codes.use_count < codes.max_uses)
    and (codes.expires_at is null or codes.expires_at > now())
  for update;

  if matched.code is null then
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
  where code = matched.code;

  update public.mybishbash_signup_handoffs
  set claimed_at = now(), claimed_user_id = p_user_id
  where id = handoff.id;

  granted_membership := coalesce(matched.grants_membership, 'premium');
  granted_expires_at := case
    when matched.grants_duration_days is not null then now() + make_interval(days => matched.grants_duration_days)
    else null
  end;

  insert into public.user_profiles (
    user_id, email, has_access, access_code, access_code_claimed_at,
    signed_up_at, last_seen_at, membership, access_tier, access_expires_at,
    grant_reason, cohort, access_source, entitlement_overrides,
    is_tester, tester_group, tester_enabled_at
  )
  values (
    p_user_id, p_email, true, matched.code, now(), now(), now(),
    granted_membership, public.membership_access_tier(granted_membership), granted_expires_at,
    matched.grant_reason, matched.cohort, 'signup_handoff', matched.entitlement_overrides,
    coalesce(matched.grants_tester, false), matched.tester_group,
    case when coalesce(matched.grants_tester, false) then now() else null end
  )
  on conflict (user_id) do update
  set
    email = coalesce(excluded.email, public.user_profiles.email),
    has_access = true,
    access_code = coalesce(public.user_profiles.access_code, matched.code),
    access_code_claimed_at = coalesce(public.user_profiles.access_code_claimed_at, now()),
    last_seen_at = now(),
    membership = case
      when public.membership_rank(public.user_profiles.membership) >= public.membership_rank(excluded.membership)
        then public.user_profiles.membership
      else excluded.membership
    end,
    access_tier = public.membership_access_tier(case
      when public.membership_rank(public.user_profiles.membership) >= public.membership_rank(excluded.membership)
        then public.user_profiles.membership
      else excluded.membership
    end),
    access_expires_at = case
      when public.membership_rank(public.user_profiles.membership) >= public.membership_rank(excluded.membership)
        and public.user_profiles.access_expires_at is null then null
      when excluded.access_expires_at is null then null
      else greatest(coalesce(public.user_profiles.access_expires_at, excluded.access_expires_at), excluded.access_expires_at)
    end,
    grant_reason = coalesce(public.user_profiles.grant_reason, excluded.grant_reason),
    cohort = coalesce(public.user_profiles.cohort, excluded.cohort),
    access_source = coalesce(public.user_profiles.access_source, 'signup_handoff'),
    entitlement_overrides = coalesce(public.user_profiles.entitlement_overrides, excluded.entitlement_overrides),
    is_tester = public.user_profiles.is_tester or excluded.is_tester,
    tester_group = coalesce(excluded.tester_group, public.user_profiles.tester_group),
    tester_enabled_at = coalesce(public.user_profiles.tester_enabled_at, excluded.tester_enabled_at);

  insert into public.access_audit_log (user_id, email, changed_by, action, new_values, reason, expires_at)
  values (
    p_user_id, p_email, 'system:signup_handoff', 'grant',
    jsonb_build_object(
      'has_access', true,
      'membership', granted_membership,
      'access_expires_at', granted_expires_at,
      'access_code', matched.code,
      'grant_reason', matched.grant_reason,
      'cohort', matched.cohort
    ),
    matched.grant_reason,
    granted_expires_at
  );

  return true;
end;
$$;

revoke execute on function public.redeem_mybishbash_signup_handoff(text, uuid, text) from public, anon, authenticated;

-- ── signup trigger: handoff-first, then legacy code + pending grants ─────────

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  metadata_access_code text;
  metadata_handoff_ref text;
  matched public.mybishbash_access_codes%rowtype;
  pending public.pending_access_grants%rowtype;
  granted_membership text;
  granted_expires_at timestamptz;
begin
  metadata_handoff_ref := nullif(trim(coalesce(new.raw_user_meta_data ->> 'mybishbash_signup_handoff_ref', '')), '');

  if metadata_handoff_ref is not null then
    perform public.redeem_mybishbash_signup_handoff(metadata_handoff_ref, new.id, new.email);
  end if;

  -- Legacy path only runs when the handoff did not already create the profile.
  if not exists (select 1 from public.user_profiles where user_id = new.id) then
    metadata_access_code := public.normalize_mybishbash_access_code(new.raw_user_meta_data ->> 'mybishbash_access_code');

    if metadata_access_code <> '' then
      select codes.* into matched
      from public.mybishbash_access_codes codes
      where public.normalize_mybishbash_access_code(codes.code) = metadata_access_code
        and codes.active = true
        and (codes.max_uses is null or codes.use_count < codes.max_uses)
        and (codes.expires_at is null or codes.expires_at > now())
      limit 1;
    end if;

    granted_membership := coalesce(matched.grants_membership, 'premium');
    granted_expires_at := case
      when matched.code is not null and matched.grants_duration_days is not null
        then now() + make_interval(days => matched.grants_duration_days)
      else null
    end;

    insert into public.user_profiles (
      user_id, email, signed_up_at, last_seen_at, has_access, access_code,
      access_code_claimed_at, membership, access_tier, access_expires_at,
      grant_reason, cohort, access_source, entitlement_overrides,
      is_tester, tester_group, tester_enabled_at
    )
    values (
      new.id,
      new.email,
      coalesce(new.created_at, now()),
      coalesce(new.last_sign_in_at, new.created_at, now()),
      matched.code is not null,
      matched.code,
      case when matched.code is not null then now() else null end,
      case when matched.code is not null then granted_membership else 'free' end,
      case when matched.code is not null then public.membership_access_tier(granted_membership) else 'free' end,
      granted_expires_at,
      matched.grant_reason,
      matched.cohort,
      case when matched.code is not null then 'access_code' else null end,
      matched.entitlement_overrides,
      coalesce(matched.grants_tester, false),
      matched.tester_group,
      case when coalesce(matched.grants_tester, false) then now() else null end
    )
    on conflict (user_id) do update
    set
      email = excluded.email,
      last_seen_at = greatest(public.user_profiles.last_seen_at, excluded.last_seen_at),
      has_access = public.user_profiles.has_access or excluded.has_access,
      access_code = coalesce(public.user_profiles.access_code, excluded.access_code),
      access_code_claimed_at = coalesce(public.user_profiles.access_code_claimed_at, excluded.access_code_claimed_at),
      membership = case
        when public.membership_rank(public.user_profiles.membership) >= public.membership_rank(excluded.membership)
          then public.user_profiles.membership
        else excluded.membership
      end,
      access_tier = public.membership_access_tier(case
        when public.membership_rank(public.user_profiles.membership) >= public.membership_rank(excluded.membership)
          then public.user_profiles.membership
        else excluded.membership
      end),
      access_expires_at = coalesce(public.user_profiles.access_expires_at, excluded.access_expires_at),
      grant_reason = coalesce(public.user_profiles.grant_reason, excluded.grant_reason),
      cohort = coalesce(public.user_profiles.cohort, excluded.cohort),
      access_source = coalesce(public.user_profiles.access_source, excluded.access_source),
      entitlement_overrides = coalesce(public.user_profiles.entitlement_overrides, excluded.entitlement_overrides),
      is_tester = public.user_profiles.is_tester or excluded.is_tester,
      tester_group = coalesce(excluded.tester_group, public.user_profiles.tester_group),
      tester_enabled_at = coalesce(public.user_profiles.tester_enabled_at, excluded.tester_enabled_at);

    if matched.code is not null then
      insert into public.access_audit_log (user_id, email, changed_by, action, new_values, reason, expires_at)
      values (
        new.id,
        new.email,
        'system:signup',
        'grant',
        jsonb_build_object(
          'has_access', true,
          'membership', granted_membership,
          'access_expires_at', granted_expires_at,
          'access_code', matched.code,
          'grant_reason', matched.grant_reason,
          'cohort', matched.cohort
        ),
        matched.grant_reason,
        granted_expires_at
      );
    end if;

    -- Apply any HQ grant created for this email before the account existed.
    select grants.* into pending
    from public.pending_access_grants grants
    where grants.normalized_email = public.normalize_access_email(new.email)
      and grants.applied_at is null
    for update;

    if pending.id is not null then
      update public.user_profiles profiles
      set
        has_access = pending.has_access,
        membership = pending.membership,
        access_tier = public.membership_access_tier(pending.membership),
        access_expires_at = pending.access_expires_at,
        grant_reason = coalesce(pending.grant_reason, profiles.grant_reason),
        cohort = coalesce(pending.cohort, profiles.cohort),
        access_source = 'hq_grant',
        entitlement_overrides = coalesce(pending.entitlement_overrides, profiles.entitlement_overrides),
        is_tester = coalesce(pending.set_tester, profiles.is_tester),
        tester_group = coalesce(pending.tester_group, profiles.tester_group),
        tester_enabled_at = case
          when coalesce(pending.set_tester, profiles.is_tester) then coalesce(profiles.tester_enabled_at, now())
          else profiles.tester_enabled_at
        end
      where profiles.user_id = new.id;

      update public.pending_access_grants
      set applied_at = now(), applied_user_id = new.id
      where id = pending.id;

      insert into public.access_audit_log (user_id, email, changed_by, action, new_values, reason, expires_at)
      values (
        new.id,
        new.email,
        'system:signup',
        'pending_grant_applied',
        jsonb_build_object(
          'has_access', pending.has_access,
          'membership', pending.membership,
          'access_expires_at', pending.access_expires_at,
          'grant_reason', pending.grant_reason,
          'cohort', pending.cohort
        ),
        pending.grant_reason,
        pending.access_expires_at
      );
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.handle_new_user_profile() from public, anon, authenticated;

-- ── user_summary: expose membership + overrides to HQ ───────────────────────

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
  profiles.membership,
  profiles.access_tier,
  profiles.access_expires_at,
  profiles.entitlement_overrides,
  profiles.grant_reason,
  profiles.cohort,
  profiles.access_source,
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
  profiles.membership,
  profiles.access_tier,
  profiles.access_expires_at,
  profiles.entitlement_overrides,
  profiles.grant_reason,
  profiles.cohort,
  profiles.access_source,
  profiles.is_tester,
  profiles.tester_group,
  profiles.tester_enabled_at,
  profiles.tester_notes;

grant select on public.user_summary to authenticated;
