-- Waitlist source codes: capture an optional campaign/audience code on waitlist
-- signups (e.g. 'bishsocial', 'fitness') so HQ can see where interest comes from.
--
-- The waitlist (launch_signups) stays separate from app accounts; this is a
-- marketing-attribution label only, not an access grant.

alter table public.launch_signups
  add column if not exists source_code text;

comment on column public.launch_signups.source_code is
  'Optional campaign/audience attribution code from the signup link (e.g. bishsocial). Marketing analytics only; not an access code.';

create index if not exists launch_signups_source_code_idx
  on public.launch_signups (source_code)
  where source_code is not null;

-- Normalize a source code: lowercase, trimmed, spaces/punctuation collapsed to a
-- slug, capped at 64 chars. NULL/blank -> NULL.
create or replace function public.normalize_waitlist_source_code(source_code text)
returns text
language sql
immutable
as $$
  select nullif(
    left(regexp_replace(lower(trim(coalesce(source_code, ''))), '[^a-z0-9_-]+', '-', 'g'), 64),
    ''
  );
$$;

-- Extend join_launch_waitlist with the optional source code (appended param).
create or replace function public.join_launch_waitlist(
  email text,
  country text,
  phone_os text,
  age_range text default null,
  main_distraction_app text default null,
  wants_beta_testing boolean default false,
  consent_launch_updates boolean default false,
  source_code text default null
)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_email text := public.normalize_waitlist_email(email);
begin
  if normalized_email = '' or trim(coalesce(country, '')) = '' or trim(coalesce(phone_os, '')) = '' or consent_launch_updates is not true then
    return 'invalid';
  end if;

  if exists (
    select 1
    from auth.users users
    where public.normalize_waitlist_email(users.email) = normalized_email
  ) then
    return 'already_account';
  end if;

  if exists (
    select 1
    from public.launch_signups signups
    where public.normalize_waitlist_email(signups.email) = normalized_email
  ) then
    return 'already_waitlist';
  end if;

  insert into public.launch_signups (
    email,
    country,
    phone_os,
    age_range,
    main_distraction_app,
    wants_beta_testing,
    consent_launch_updates,
    source_code
  )
  values (
    normalized_email,
    trim(country),
    trim(phone_os),
    nullif(trim(coalesce(age_range, '')), ''),
    nullif(trim(coalesce(main_distraction_app, '')), ''),
    coalesce(wants_beta_testing, false),
    consent_launch_updates,
    public.normalize_waitlist_source_code(source_code)
  );

  return 'created';
end;
$$;

grant execute on function public.join_launch_waitlist(text, text, text, text, text, boolean, boolean, text) to anon, authenticated;

-- Drop the previous 7-arg signature so clients move to the source-code-aware one.
drop function if exists public.join_launch_waitlist(text, text, text, text, text, boolean, boolean);
