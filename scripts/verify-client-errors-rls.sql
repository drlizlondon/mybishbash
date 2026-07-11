-- Phase 1 step 5: RLS verification for public.client_errors.
-- Run in the Supabase dashboard SQL editor AFTER applying
-- supabase/migrations/202607100001_client_errors.sql.
-- Each block is independent; the write test rolls itself back.

-- ── 0. Table + policies exist ────────────────────────────────────────────────
select policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'client_errors';
-- Expect exactly two rows:
--   "users can insert their own error reports" | INSERT | {authenticated}
--   "admins can read client errors"            | SELECT | {authenticated}

-- ── 1. Pick real user ids to simulate with ──────────────────────────────────
select
  (select id from auth.users
    where id not in (select user_id from public.admin_users) limit 1) as normal_user_id,
  (select user_id from public.admin_users limit 1)                    as admin_user_id;
-- Copy both uuids into the blocks below.

-- ── 2. Authenticated user can insert THEIR OWN report (rolled back) ─────────
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"NORMAL_USER_ID","role":"authenticated"}';
insert into public.client_errors (user_id, kind, message, release, platform, route)
values ('NORMAL_USER_ID', 'rls-check', 'staging verification insert', 'manual', 'web', '/verify');
-- Expect: INSERT 0 1 (success)

-- ── 3. ...but cannot insert AS SOMEONE ELSE (still inside the txn) ──────────
insert into public.client_errors (user_id, kind, message)
values ('ADMIN_USER_ID', 'rls-check', 'should be rejected');
-- Expect: ERROR 42501 new row violates row-level security policy
rollback;

-- ── 4. Ordinary user cannot READ any reports ────────────────────────────────
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"NORMAL_USER_ID","role":"authenticated"}';
-- Seed one visible-to-admins row as postgres first? Not needed: RLS SELECT for
-- non-admins simply filters everything out.
select count(*) as rows_visible_to_normal_user from public.client_errors;
-- Expect: 0 (RLS filters rows; no error)
rollback;

-- ── 5. Admin CAN read reports ────────────────────────────────────────────────
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"ADMIN_USER_ID","role":"authenticated"}';
select count(*) as rows_visible_to_admin from public.client_errors;
-- Expect: runs without error and shows the true row count
-- (insert a real row via steps 2 without rollback if you want a non-zero count).
rollback;

-- ── 6. Record completion ─────────────────────────────────────────────────────
-- Update docs/architecture/roadmap-status.md: migration applied date + these results.
