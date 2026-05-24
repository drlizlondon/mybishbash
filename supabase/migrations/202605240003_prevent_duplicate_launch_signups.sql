create or replace function public.prevent_duplicate_launch_signup()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  new.email := public.normalize_waitlist_email(new.email);

  if exists (
    select 1
    from auth.users users
    where public.normalize_waitlist_email(users.email) = new.email
  ) then
    raise exception 'EMAIL_ALREADY_ACCOUNT'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.launch_signups signups
    where public.normalize_waitlist_email(signups.email) = new.email
  ) then
    raise exception 'EMAIL_ALREADY_WAITLIST'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_duplicate_launch_signup on public.launch_signups;

create trigger prevent_duplicate_launch_signup
before insert on public.launch_signups
for each row
execute function public.prevent_duplicate_launch_signup();
