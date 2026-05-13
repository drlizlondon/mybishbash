-- 1. Drop the primary key constraint (which currently forces profile_id to be NOT NULL)
-- Make sure gen_random_uuid is available
create extension if not exists pgcrypto;

-- Drop old primary key on profile_id
alter table public.mybishbash_state
drop constraint if exists mybishbash_state_pkey;

-- Allow Supabase Auth rows without old sync-code profile_id
alter table public.mybishbash_state
alter column profile_id drop not null;

-- Add surrogate id column
alter table public.mybishbash_state
add column if not exists id uuid default gen_random_uuid();

-- Backfill existing rows just in case
update public.mybishbash_state
set id = gen_random_uuid()
where id is null;

-- Make id required
alter table public.mybishbash_state
alter column id set not null;

-- Add new primary key on id
alter table public.mybishbash_state
add constraint mybishbash_state_pkey primary key (id);

-- Preserve old sync-code uniqueness
alter table public.mybishbash_state
drop constraint if exists mybishbash_state_profile_id_key;

alter table public.mybishbash_state
add constraint mybishbash_state_profile_id_key unique (profile_id);