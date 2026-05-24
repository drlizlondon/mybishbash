create or replace function public.normalize_waitlist_email(email text)
returns text
language sql
immutable
as $$
  select lower(trim(coalesce(email, '')));
$$;

create or replace function public.join_launch_waitlist(
  email text,
  country text,
  phone_os text,
  age_range text default null,
  main_distraction_app text default null,
  wants_beta_testing boolean default false,
  consent_launch_updates boolean default false
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
    consent_launch_updates
  )
  values (
    normalized_email,
    trim(country),
    trim(phone_os),
    nullif(trim(coalesce(age_range, '')), ''),
    nullif(trim(coalesce(main_distraction_app, '')), ''),
    coalesce(wants_beta_testing, false),
    consent_launch_updates
  );

  return 'created';
end;
$$;

grant execute on function public.join_launch_waitlist(text, text, text, text, text, boolean, boolean) to anon, authenticated;
