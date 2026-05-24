alter table public.user_profiles
  add column if not exists has_access boolean not null default false,
  add column if not exists access_code_claimed_at timestamptz,
  add column if not exists access_code text;

update public.user_profiles
set
  has_access = true,
  access_code_claimed_at = coalesce(access_code_claimed_at, signed_up_at)
where has_access = false;

create table if not exists public.mybishbash_access_codes (
  code text primary key,
  active boolean not null default true,
  max_uses integer,
  use_count integer not null default 0,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);

alter table public.mybishbash_access_codes enable row level security;

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
begin
  select codes.code
  into matched_code
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

  insert into public.user_profiles (user_id, email, has_access, access_code, access_code_claimed_at, signed_up_at, last_seen_at)
  values (auth.uid(), auth.jwt() ->> 'email', true, matched_code, now(), now(), now())
  on conflict (user_id) do update
  set
    email = coalesce(excluded.email, public.user_profiles.email),
    has_access = true,
    access_code = coalesce(public.user_profiles.access_code, matched_code),
    access_code_claimed_at = coalesce(public.user_profiles.access_code_claimed_at, now()),
    last_seen_at = now();

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
begin
  metadata_access_code := public.normalize_mybishbash_access_code(new.raw_user_meta_data ->> 'mybishbash_access_code');

  if metadata_access_code <> '' then
    select codes.code
    into matched_code
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
    access_code_claimed_at
  )
  values (
    new.id,
    new.email,
    coalesce(new.created_at, now()),
    coalesce(new.last_sign_in_at, new.created_at, now()),
    matched_code is not null,
    matched_code,
    case when matched_code is not null then now() else null end
  )
  on conflict (user_id) do update
  set
    email = excluded.email,
    last_seen_at = greatest(public.user_profiles.last_seen_at, excluded.last_seen_at),
    has_access = public.user_profiles.has_access or excluded.has_access,
    access_code = coalesce(public.user_profiles.access_code, excluded.access_code),
    access_code_claimed_at = coalesce(public.user_profiles.access_code_claimed_at, excluded.access_code_claimed_at);

  return new;
end;
$$;

revoke execute on function public.validate_mybishbash_access_code(text) from public;
revoke execute on function public.claim_mybishbash_access_code(text) from public;
grant execute on function public.validate_mybishbash_access_code(text) to anon, authenticated;
grant execute on function public.claim_mybishbash_access_code(text) to authenticated;
