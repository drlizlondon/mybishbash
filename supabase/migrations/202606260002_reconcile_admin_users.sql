-- Fix HQ Packs save/publish failing with RLS 42501.
--
-- HQ admits the owner into the Packs editor via the client-side
-- VITE_HQ_ADMIN_EMAILS allowlist, but every write to global_packs /
-- global_pack_cards is gated by RLS requiring a row in admin_users keyed on
-- auth.uid(). admin_users was seeded with a HARDCODED user_id
-- (202605120001), which does not match the owner's real auth user_id — so the
-- editor opens, published packs read fine, but every save/publish is denied.
--
-- Reconcile admin_users by EMAIL from auth.users so the DB recognises the same
-- identity the client allowlist does. Idempotent; deletes nothing.

insert into public.admin_users (user_id, email, role)
select users.id, users.email, 'owner'
from auth.users users
where lower(users.email) = lower('lizzies_95@hotmail.co.uk')
on conflict (user_id) do update
  set email = excluded.email,
      role = case when public.admin_users.role = 'owner' then 'owner' else excluded.role end;

-- Drop the stale hardcoded-UUID seed row if it never corresponded to a real
-- auth user (and is not the row we just reconciled).
delete from public.admin_users
where user_id = '3fb7946d-0283-4d4c-8156-96c9873b4894'
  and not exists (
    select 1 from auth.users users where users.id = public.admin_users.user_id
  );
