-- Access architecture step 1: technical tiers + grant metadata + audit trail.
--
-- One access system: user_profiles stays the single source of truth.
-- Tier vocabulary is technical only ('free' | 'premium'); marketing identity
-- (founder, press, influencer...) lives in grant_reason/cohort metadata and
-- must never be branched on by gating code.
--
-- All access writes now flow through security-definer functions that append
-- to access_audit_log: hq_set_user_access (HQ, by email), hq_create_access_code,
-- hq_set_tester_status, claim_mybishbash_access_code, and the signup trigger.
-- Direct client updates to access columns are revoked (this also closes a
-- pre-existing hole where the broad update grant let users flip their own
-- has_access).

-- ── user_profiles: tier + grant metadata ─────────────────────────────────────

alter table public.user_profiles
  add column if not exists access_tier text not null default 'free'
    check (access_tier in ('free', 'premium')),
  add column if not exists access_expires_at timestamptz,
  add column if not exists grant_reason text,
  add column if not exists cohort text,
  add column if not exists access_source text,
  add column if not exists stripe_customer_id text;

comment on column public.user_profiles.access_tier is
  'Technical tier only (free|premium). Gating code reads this + access_expires_at and nothing else.';
comment on column public.user_profiles.grant_reason is
  'Why access was granted (press, founder, influencer, promo...). Free text for HQ/audit/analytics; never branched on.';
comment on column public.user_profiles.cohort is
  'Marketing/campaign cohort label (e.g. founding-2026). Free text; never branched on.';
comment on column public.user_profiles.access_source is
  'Which door granted access: access_code | hq_grant | stripe | system.';

-- Backfill: everyone with access today predates open signup, so they are the
-- founding cohort on premium. Lifetime is expressed as a null expiry.
update public.user_profiles
set
  access_tier = 'premium',
  grant_reason = coalesce(grant_reason, 'founder'),
  cohort = coalesce(cohort, 'founding-2026'),
  access_source = coalesce(access_source, case when access_code is not null then 'access_code' else 'system' end)
where has_access = true
  and access_tier = 'free';

-- ── access codes: codes grant tier metadata, like grants_tester already does ─

alter table public.mybishbash_access_codes
  add column if not exists grants_tier text not null default 'premium'
    check (grants_tier in ('free', 'premium')),
  add column if not exists grant_reason text,
  add column if not exists cohort text,
  add column if not exists grants_duration_days integer
    check (grants_duration_days is null or grants_duration_days > 0),
  add column if not exists expires_at timestamptz,
  add column if not exists label text,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

comment on column public.mybishbash_access_codes.grants_duration_days is
  'Access duration stamped at claim time (expiry = claim time + days). NULL = permanent.';
comment on column public.mybishbash_access_codes.expires_at is
  'When the code itself stops being claimable. NULL = no code expiry.';

-- HQ needs to list codes; reads were previously locked out entirely (RLS with
-- no policies). Writes stay RPC-only.
grant select on public.mybishbash_access_codes to authenticated;

drop policy if exists "admins can read access codes" on public.mybishbash_access_codes;
create policy "admins can read access codes"
  on public.mybishbash_access_codes for select to authenticated
  using (exists (
    select 1 from public.admin_users admins where admins.user_id = auth.uid()
  ));

-- The client previously honoured these codes via a hardcoded bypass list in
-- mybishbashSync.js (now removed — all validation is server-side). Seed them
-- here so codes already in circulation keep working; deactivate or rotate
-- them from HQ once distribution moves to managed codes.
insert into public.mybishbash_access_codes (code, active, grants_tier, grant_reason, cohort, label)
values
  ('REDDIT-14', true, 'premium', 'promo', 'founding-2026', 'Legacy hardcoded client code'),
  ('FAMILY-ALPHA', true, 'premium', 'family', 'founding-2026', 'Legacy hardcoded client code'),
  ('FOUNDER-EARLY', true, 'premium', 'founder', 'founding-2026', 'Legacy hardcoded client code')
on conflict do nothing;

insert into public.mybishbash_access_codes (code, active, grants_tier, grant_reason, cohort, label, grants_tester)
values
  ('TESTER', true, 'premium', 'tester', 'founding-2026', 'Legacy hardcoded client code', true)
on conflict do nothing;

-- ── pending grants: HQ can grant by email before the user has signed up ──────

create table if not exists public.pending_access_grants (
  id uuid primary key default gen_random_uuid(),
  normalized_email text not null unique,
  has_access boolean not null default true,
  access_tier text not null default 'premium' check (access_tier in ('free', 'premium')),
  access_expires_at timestamptz,
  grant_reason text,
  cohort text,
  set_tester boolean,
  tester_group text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  applied_at timestamptz,
  applied_user_id uuid references auth.users(id) on delete set null
);

alter table public.pending_access_grants enable row level security;

grant select on public.pending_access_grants to authenticated;

drop policy if exists "admins can read pending access grants" on public.pending_access_grants;
create policy "admins can read pending access grants"
  on public.pending_access_grants for select to authenticated
  using (exists (
    select 1 from public.admin_users admins where admins.user_id = auth.uid()
  ));

-- ── audit trail: append-only, written only inside security-definer functions ─

create table if not exists public.access_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  changed_by text not null,
  action text not null,
  old_values jsonb,
  new_values jsonb,
  reason text,
  expires_at timestamptz
);

comment on table public.access_audit_log is
  'Append-only audit of every access change. changed_by is an admin email or system:signup | system:code_claim | system:stripe.';

alter table public.access_audit_log enable row level security;

-- Admins read; nobody gets insert/update/delete grants — rows are written by
-- security-definer functions only, so append-only holds by construction.
grant select on public.access_audit_log to authenticated;

drop policy if exists "admins can read access audit log" on public.access_audit_log;
create policy "admins can read access audit log"
  on public.access_audit_log for select to authenticated
  using (exists (
    select 1 from public.admin_users admins where admins.user_id = auth.uid()
  ));

create index if not exists access_audit_log_created_at_idx on public.access_audit_log(created_at desc);
create index if not exists access_audit_log_email_idx on public.access_audit_log(email);

-- ── helpers ──────────────────────────────────────────────────────────────────

create or replace function public.normalize_access_email(email text)
returns text
language sql
immutable
as $$
  select lower(trim(coalesce(email, '')));
$$;

-- Single definition of "does this user currently have active access".
create or replace function public.has_active_access(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select profiles.has_access
      and (profiles.access_expires_at is null or profiles.access_expires_at > now())
    from public.user_profiles profiles
    where profiles.user_id = target_user_id
  ), false);
$$;

revoke execute on function public.has_active_access(uuid) from public;
grant execute on function public.has_active_access(uuid) to authenticated;

create or replace function public.is_hq_access_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users admins
    where admins.user_id = auth.uid() and admins.role in ('owner', 'admin')
  );
$$;

revoke execute on function public.is_hq_access_admin() from public;
grant execute on function public.is_hq_access_admin() to authenticated;

-- ── lock down direct profile writes ──────────────────────────────────────────
--
-- Previously `grant update on user_profiles to authenticated` + the
-- "users can touch own profile" policy let any user update ANY column of their
-- own row, including has_access/is_tester. Access and tester fields are now
-- writable only via the security-definer functions below; clients keep
-- heartbeat writes (email, last_seen_at) only.

revoke update on public.user_profiles from authenticated;
grant update (email, last_seen_at) on public.user_profiles to authenticated;

-- Same for insert: profile rows are created by the signup trigger; a client
-- insert may only carry identity/heartbeat columns (access columns take their
-- safe defaults).
revoke insert on public.user_profiles from authenticated;
grant insert (user_id, email, signed_up_at, last_seen_at) on public.user_profiles to authenticated;

-- Admin profile edits also move into RPCs; the broad direct-update policy goes.
drop policy if exists "admins can update all profiles" on public.user_profiles;

-- ── HQ: grant / extend / revoke access by email ──────────────────────────────

create or replace function public.hq_set_user_access(
  p_email text,
  p_grant boolean,
  p_tier text default 'premium',
  p_expires_at timestamptz default null,
  p_reason text default null,
  p_cohort text default null
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

  if p_tier not in ('free', 'premium') then
    raise exception 'Invalid tier %', p_tier;
  end if;

  normalized_email := public.normalize_access_email(p_email);
  if normalized_email = '' then
    raise exception 'An email address is required';
  end if;

  select * into target
  from public.user_profiles profiles
  where public.normalize_access_email(profiles.email) = normalized_email
  limit 1;

  if target.user_id is not null then
    old_values := jsonb_build_object(
      'has_access', target.has_access,
      'access_tier', target.access_tier,
      'access_expires_at', target.access_expires_at,
      'grant_reason', target.grant_reason,
      'cohort', target.cohort
    );

    update public.user_profiles profiles
    set
      has_access = p_grant,
      access_tier = case when p_grant then p_tier else 'free' end,
      access_expires_at = case when p_grant then p_expires_at else null end,
      grant_reason = case when p_grant then coalesce(p_reason, profiles.grant_reason) else profiles.grant_reason end,
      cohort = coalesce(p_cohort, profiles.cohort),
      access_source = 'hq_grant'
    where profiles.user_id = target.user_id;

    outcome := 'updated';
  else
    insert into public.pending_access_grants (
      normalized_email, has_access, access_tier, access_expires_at,
      grant_reason, cohort, created_by, updated_at
    )
    values (
      normalized_email, p_grant, case when p_grant then p_tier else 'free' end,
      case when p_grant then p_expires_at else null end,
      p_reason, p_cohort, auth.uid(), now()
    )
    on conflict (normalized_email) do update
    set
      has_access = excluded.has_access,
      access_tier = excluded.access_tier,
      access_expires_at = excluded.access_expires_at,
      grant_reason = coalesce(excluded.grant_reason, public.pending_access_grants.grant_reason),
      cohort = coalesce(excluded.cohort, public.pending_access_grants.cohort),
      created_by = excluded.created_by,
      updated_at = now(),
      applied_at = null,
      applied_user_id = null;

    outcome := 'pending';
  end if;

  new_values := jsonb_build_object(
    'has_access', p_grant,
    'access_tier', case when p_grant then p_tier else 'free' end,
    'access_expires_at', case when p_grant then p_expires_at else null end,
    'grant_reason', p_reason,
    'cohort', p_cohort
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

revoke execute on function public.hq_set_user_access(text, boolean, text, timestamptz, text, text) from public;
grant execute on function public.hq_set_user_access(text, boolean, text, timestamptz, text, text) to authenticated;

-- ── HQ: create access codes (previously manual SQL) ─────────────────────────

create or replace function public.hq_create_access_code(
  p_code text,
  p_label text default null,
  p_max_uses integer default null,
  p_grants_tier text default 'premium',
  p_grant_reason text default null,
  p_cohort text default null,
  p_grants_duration_days integer default null,
  p_expires_at timestamptz default null,
  p_grants_tester boolean default false,
  p_tester_group text default null
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

  if p_grants_tier not in ('free', 'premium') then
    raise exception 'Invalid tier %', p_grants_tier;
  end if;

  normalized_code := public.normalize_mybishbash_access_code(p_code);
  if normalized_code = '' then
    raise exception 'A code is required';
  end if;

  insert into public.mybishbash_access_codes (
    code, active, max_uses, grants_tier, grant_reason, cohort,
    grants_duration_days, expires_at, label, grants_tester, tester_group, created_by
  )
  values (
    normalized_code, true, p_max_uses, p_grants_tier, p_grant_reason, p_cohort,
    p_grants_duration_days, p_expires_at, p_label, coalesce(p_grants_tester, false), p_tester_group, auth.uid()
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
      'grants_tier', p_grants_tier,
      'grant_reason', p_grant_reason,
      'cohort', p_cohort,
      'grants_duration_days', p_grants_duration_days,
      'grants_tester', coalesce(p_grants_tester, false)
    ),
    p_grant_reason,
    p_expires_at
  );

  return jsonb_build_object('status', 'created', 'code', normalized_code);
end;
$$;

revoke execute on function public.hq_create_access_code(text, text, integer, text, text, text, integer, timestamptz, boolean, text) from public;
grant execute on function public.hq_create_access_code(text, text, integer, text, text, text, integer, timestamptz, boolean, text) to authenticated;

-- ── HQ: deactivate a code ────────────────────────────────────────────────────

create or replace function public.hq_set_access_code_active(
  p_code text,
  p_active boolean
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
    raise exception 'Only owner/admin HQ roles can manage access codes';
  end if;

  normalized_code := public.normalize_mybishbash_access_code(p_code);

  update public.mybishbash_access_codes codes
  set active = p_active
  where public.normalize_mybishbash_access_code(codes.code) = normalized_code;

  if not found then
    raise exception 'Unknown access code';
  end if;

  insert into public.access_audit_log (email, changed_by, action, new_values)
  values (null, admin_email, case when p_active then 'code_activated' else 'code_deactivated' end,
          jsonb_build_object('code', normalized_code, 'active', p_active));

  return jsonb_build_object('status', 'updated', 'code', normalized_code, 'active', p_active);
end;
$$;

revoke execute on function public.hq_set_access_code_active(text, boolean) from public;
grant execute on function public.hq_set_access_code_active(text, boolean) to authenticated;

-- ── HQ: tester status moves from direct table update into an audited RPC ─────

create or replace function public.hq_set_tester_status(
  p_user_id uuid,
  p_is_tester boolean,
  p_tester_group text default null,
  p_tester_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_email text;
  target public.user_profiles%rowtype;
begin
  select admins.email into admin_email
  from public.admin_users admins
  where admins.user_id = auth.uid() and admins.role in ('owner', 'admin');

  if admin_email is null then
    raise exception 'Only owner/admin HQ roles can manage testers';
  end if;

  select * into target from public.user_profiles profiles where profiles.user_id = p_user_id;
  if target.user_id is null then
    raise exception 'Unknown user';
  end if;

  update public.user_profiles profiles
  set
    is_tester = coalesce(p_is_tester, false),
    tester_group = nullif(trim(coalesce(p_tester_group, '')), ''),
    tester_notes = nullif(trim(coalesce(p_tester_notes, '')), ''),
    tester_enabled_at = case
      when coalesce(p_is_tester, false) then coalesce(profiles.tester_enabled_at, now())
      else null
    end
  where profiles.user_id = p_user_id;

  insert into public.access_audit_log (user_id, email, changed_by, action, old_values, new_values)
  values (
    p_user_id,
    target.email,
    admin_email,
    'tester_change',
    jsonb_build_object('is_tester', target.is_tester, 'tester_group', target.tester_group),
    jsonb_build_object('is_tester', coalesce(p_is_tester, false), 'tester_group', nullif(trim(coalesce(p_tester_group, '')), ''))
  );

  return jsonb_build_object('status', 'updated', 'user_id', p_user_id);
end;
$$;

revoke execute on function public.hq_set_tester_status(uuid, boolean, text, text) from public;
grant execute on function public.hq_set_tester_status(uuid, boolean, text, text) to authenticated;

-- ── validate RPC: respect the new code expiry ────────────────────────────────

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
      and (codes.expires_at is null or codes.expires_at > now())
  );
$$;

-- ── claim RPC: stamp tier metadata + audit (signature unchanged) ─────────────

create or replace function public.claim_mybishbash_access_code(access_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  matched public.mybishbash_access_codes%rowtype;
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

  granted_expires_at := case
    when matched.grants_duration_days is not null then now() + make_interval(days => matched.grants_duration_days)
    else null
  end;

  insert into public.user_profiles (
    user_id,
    email,
    has_access,
    access_code,
    access_code_claimed_at,
    signed_up_at,
    last_seen_at,
    access_tier,
    access_expires_at,
    grant_reason,
    cohort,
    access_source,
    is_tester,
    tester_group,
    tester_enabled_at
  )
  values (
    auth.uid(),
    auth.jwt() ->> 'email',
    true,
    matched.code,
    now(),
    now(),
    now(),
    coalesce(matched.grants_tier, 'premium'),
    granted_expires_at,
    matched.grant_reason,
    matched.cohort,
    'access_code',
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
    access_tier = case
      when public.user_profiles.access_tier = 'premium' then 'premium'
      else excluded.access_tier
    end,
    access_expires_at = case
      -- A permanent grant (either side) stays permanent; otherwise keep the later expiry.
      when public.user_profiles.access_tier = 'premium' and public.user_profiles.access_expires_at is null then null
      when excluded.access_expires_at is null then null
      else greatest(coalesce(public.user_profiles.access_expires_at, excluded.access_expires_at), excluded.access_expires_at)
    end,
    grant_reason = coalesce(public.user_profiles.grant_reason, excluded.grant_reason),
    cohort = coalesce(public.user_profiles.cohort, excluded.cohort),
    access_source = coalesce(public.user_profiles.access_source, 'access_code'),
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
      'access_tier', coalesce(matched.grants_tier, 'premium'),
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

-- ── signup trigger: stamp tier metadata, apply pending email grants, audit ───

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  metadata_access_code text;
  matched public.mybishbash_access_codes%rowtype;
  pending public.pending_access_grants%rowtype;
  granted_expires_at timestamptz;
begin
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

  granted_expires_at := case
    when matched.code is not null and matched.grants_duration_days is not null
      then now() + make_interval(days => matched.grants_duration_days)
    else null
  end;

  insert into public.user_profiles (
    user_id,
    email,
    signed_up_at,
    last_seen_at,
    has_access,
    access_code,
    access_code_claimed_at,
    access_tier,
    access_expires_at,
    grant_reason,
    cohort,
    access_source,
    is_tester,
    tester_group,
    tester_enabled_at
  )
  values (
    new.id,
    new.email,
    coalesce(new.created_at, now()),
    coalesce(new.last_sign_in_at, new.created_at, now()),
    matched.code is not null,
    matched.code,
    case when matched.code is not null then now() else null end,
    case when matched.code is not null then coalesce(matched.grants_tier, 'premium') else 'free' end,
    granted_expires_at,
    matched.grant_reason,
    matched.cohort,
    case when matched.code is not null then 'access_code' else null end,
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
    access_tier = case
      when public.user_profiles.access_tier = 'premium' then 'premium'
      else excluded.access_tier
    end,
    access_expires_at = coalesce(public.user_profiles.access_expires_at, excluded.access_expires_at),
    grant_reason = coalesce(public.user_profiles.grant_reason, excluded.grant_reason),
    cohort = coalesce(public.user_profiles.cohort, excluded.cohort),
    access_source = coalesce(public.user_profiles.access_source, excluded.access_source),
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
        'access_tier', coalesce(matched.grants_tier, 'premium'),
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
      access_tier = pending.access_tier,
      access_expires_at = pending.access_expires_at,
      grant_reason = coalesce(pending.grant_reason, profiles.grant_reason),
      cohort = coalesce(pending.cohort, profiles.cohort),
      access_source = 'hq_grant',
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
        'access_tier', pending.access_tier,
        'access_expires_at', pending.access_expires_at,
        'grant_reason', pending.grant_reason,
        'cohort', pending.cohort
      ),
      pending.grant_reason,
      pending.access_expires_at
    );
  end if;

  return new;
end;
$$;

-- ── user_summary: expose tier metadata to HQ ─────────────────────────────────

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
  profiles.access_tier,
  profiles.access_expires_at,
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
  profiles.access_tier,
  profiles.access_expires_at,
  profiles.grant_reason,
  profiles.cohort,
  profiles.access_source,
  profiles.is_tester,
  profiles.tester_group,
  profiles.tester_enabled_at,
  profiles.tester_notes;

grant select on public.user_summary to authenticated;
