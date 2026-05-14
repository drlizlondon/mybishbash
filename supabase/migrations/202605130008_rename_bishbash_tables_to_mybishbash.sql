-- Preserve existing personal/internal data after the repository rename.
-- Fresh installs already create the mybishbash_* tables from the edited baseline migrations.
do $$
begin
  if to_regclass('public.mybishbash_state') is null and to_regclass('public.bishbash_state') is not null then
    alter table public.bishbash_state rename to mybishbash_state;
  end if;

  if to_regclass('public.mybishbash_events') is null and to_regclass('public.bishbash_events') is not null then
    alter table public.bishbash_events rename to mybishbash_events;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.mybishbash_state'::regclass
      and conname = 'bishbash_state_pkey'
  ) then
    alter table public.mybishbash_state rename constraint bishbash_state_pkey to mybishbash_state_pkey;
  end if;

  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.mybishbash_state'::regclass
      and conname = 'bishbash_state_profile_id_key'
  ) then
    alter table public.mybishbash_state rename constraint bishbash_state_profile_id_key to mybishbash_state_profile_id_key;
  end if;

  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.mybishbash_state'::regclass
      and conname = 'bishbash_state_user_id_key'
  ) then
    alter table public.mybishbash_state rename constraint bishbash_state_user_id_key to mybishbash_state_user_id_key;
  end if;
end $$;

alter index if exists public.bishbash_events_created_at_idx rename to mybishbash_events_created_at_idx;
alter index if exists public.bishbash_events_user_created_at_idx rename to mybishbash_events_user_created_at_idx;
alter index if exists public.bishbash_events_type_created_at_idx rename to mybishbash_events_type_created_at_idx;
