alter table public.user_profiles
  add column if not exists has_access boolean not null default false,
  add column if not exists access_code_claimed_at timestamptz,
  add column if not exists access_code text;

update public.user_profiles
set
  has_access = true,
  access_code_claimed_at = coalesce(access_code_claimed_at, signed_up_at)
where has_access = false;

alter table public.mybishbash_access_codes
  add column if not exists active boolean not null default true,
  add column if not exists max_uses integer,
  add column if not exists use_count integer not null default 0,
  add column if not exists claimed_at timestamptz;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'mybishbash_access_codes'
      and column_name = 'used_at'
  ) then
    execute $repair$
      update public.mybishbash_access_codes
      set
        active = case
          when used_at is not null then false
          else active
        end,
        use_count = case
          when used_at is not null then greatest(use_count, 1)
          else use_count
        end,
        max_uses = coalesce(max_uses, 1),
        claimed_at = coalesce(claimed_at, used_at)
    $repair$;
  end if;
end;
$$;

create or replace function public.normalize_mybishbash_access_code(access_code text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(trim(coalesce(access_code, '')), '[[:space:]]+', '', 'g'));
$$;

create unique index if not exists mybishbash_access_codes_normalized_code_idx
  on public.mybishbash_access_codes (public.normalize_mybishbash_access_code(code));

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

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert or update of email, last_sign_in_at on auth.users
  for each row execute function public.handle_new_user_profile();

revoke execute on function public.validate_mybishbash_access_code(text) from public;
revoke execute on function public.claim_mybishbash_access_code(text) from public;
grant execute on function public.validate_mybishbash_access_code(text) to anon, authenticated;
grant execute on function public.claim_mybishbash_access_code(text) to authenticated;

grant select, insert, update on public.user_profiles to authenticated;
