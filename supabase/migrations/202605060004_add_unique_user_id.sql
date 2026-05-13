-- Add a unique constraint to user_id so Supabase upsert (ON CONFLICT) works safely.
-- PostgreSQL permits multiple NULL values in a UNIQUE column, so existing
-- sync-code rows (where user_id is NULL) will not conflict.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bishbash_state_user_id_key'
      and conrelid = 'public.bishbash_state'::regclass
  ) then
    alter table public.bishbash_state
    add constraint bishbash_state_user_id_key unique (user_id);
  end if;
end $$;
