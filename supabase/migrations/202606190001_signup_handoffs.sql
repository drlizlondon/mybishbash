-- Signup handoffs let the invite gate validate a code once, then pass only a
-- short-lived opaque reference into auth signup. The access code is claimed
-- when the account is created, not when the invite page is submitted.

create table if not exists public.mybishbash_signup_handoffs (
  id uuid primary key default gen_random_uuid(),
  handoff_ref text not null unique default gen_random_uuid()::text,
  access_code text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  claimed_at timestamptz,
  claimed_user_id uuid references auth.users(id) on delete set null
);

alter table public.mybishbash_signup_handoffs enable row level security;

create index if not exists mybishbash_signup_handoffs_ref_idx
  on public.mybishbash_signup_handoffs(handoff_ref);

create index if not exists mybishbash_signup_handoffs_expiry_idx
  on public.mybishbash_signup_handoffs(expires_at)
  where claimed_at is null;

create or replace function public.create_mybishbash_signup_handoff(access_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  matched public.mybishbash_access_codes%rowtype;
  created public.mybishbash_signup_handoffs%rowtype;
begin
  select codes.* into matched
  from public.mybishbash_access_codes codes
  where public.normalize_mybishbash_access_code(codes.code) = public.normalize_mybishbash_access_code(access_code)
    and codes.active = true
    and (codes.max_uses is null or codes.use_count < codes.max_uses)
    and (codes.expires_at is null or codes.expires_at > now())
  limit 1;

  if matched.code is null then
    return null;
  end if;

  insert into public.mybishbash_signup_handoffs (access_code)
  values (matched.code)
  returning * into created;

  return jsonb_build_object(
    'handoff_ref', created.handoff_ref,
    'expires_at', created.expires_at
  );
end;
$$;

revoke execute on function public.create_mybishbash_signup_handoff(text) from public;
grant execute on function public.create_mybishbash_signup_handoff(text) to anon, authenticated;

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
    p_user_id,
    p_email,
    true,
    matched.code,
    now(),
    now(),
    now(),
    coalesce(matched.grants_tier, 'premium'),
    granted_expires_at,
    matched.grant_reason,
    matched.cohort,
    'signup_handoff',
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
      when public.user_profiles.access_tier = 'premium' and public.user_profiles.access_expires_at is null then null
      when excluded.access_expires_at is null then null
      else greatest(coalesce(public.user_profiles.access_expires_at, excluded.access_expires_at), excluded.access_expires_at)
    end,
    grant_reason = coalesce(public.user_profiles.grant_reason, excluded.grant_reason),
    cohort = coalesce(public.user_profiles.cohort, excluded.cohort),
    access_source = coalesce(public.user_profiles.access_source, 'signup_handoff'),
    is_tester = public.user_profiles.is_tester or excluded.is_tester,
    tester_group = coalesce(excluded.tester_group, public.user_profiles.tester_group),
    tester_enabled_at = coalesce(public.user_profiles.tester_enabled_at, excluded.tester_enabled_at);

  insert into public.access_audit_log (user_id, email, changed_by, action, new_values, reason, expires_at)
  values (
    p_user_id,
    p_email,
    'system:signup_handoff',
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

revoke execute on function public.redeem_mybishbash_signup_handoff(text, uuid, text) from public, anon, authenticated;

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
  granted_expires_at timestamptz;
begin
  metadata_handoff_ref := nullif(trim(coalesce(new.raw_user_meta_data ->> 'mybishbash_signup_handoff_ref', '')), '');

  if metadata_handoff_ref is not null then
    perform public.redeem_mybishbash_signup_handoff(metadata_handoff_ref, new.id, new.email);
  end if;

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
  end if;

  return new;
end;
$$;

revoke execute on function public.handle_new_user_profile() from public, anon, authenticated;
