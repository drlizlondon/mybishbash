-- Phase 1 step 5: RLS verification for public.client_errors.
-- Run in the Supabase dashboard SQL editor AFTER applying
-- supabase/migrations/202607100001_client_errors.sql.
--
-- Self-contained: picks a real non-admin user and a real admin automatically,
-- no manual uuid substitution. Nothing throws (the expected RLS rejection is
-- trapped), and it leaves NO rows behind — the probe and any test inserts are
-- deleted before it returns. Paste the whole file, Run once, read the grid.
--
-- Expected result grid (all pass = true):
--   0 policies present        | 2      | 2
--   1 users found (non-null)   | both   | both
--   2 insert own row           | success| success
--   3 insert as other user     | blocked| blocked
--   4 normal user reads        | 0      | 0
--   5 admin reads              | >= 1   | (>=1)

create temp table if not exists _rls_results (
  step text, expected text, actual text, pass boolean
);
truncate _rls_results;

do $$
declare
  orig      text := current_user;
  normal_id uuid;
  admin_id  uuid;
  probe_id  uuid := gen_random_uuid();
  n         bigint;
  ok        boolean;
begin
  -- Resolve real ids while still acting as the table owner (bypasses RLS).
  select id into normal_id from auth.users
    where id not in (select user_id from public.admin_users) limit 1;
  select user_id into admin_id from public.admin_users limit 1;

  insert into _rls_results values (
    '1 users found (non-null)', 'both',
    concat('normal=', coalesce(normal_id::text, 'NULL'),
           ' admin=', coalesce(admin_id::text, 'NULL')),
    normal_id is not null and admin_id is not null
  );

  -- Probe row for the read tests (owner insert, RLS not enforced for owner).
  insert into public.client_errors (id, user_id, kind, message)
  values (probe_id, normal_id, 'rls-verify-probe', 'verification probe');

  -- 0. Both policies exist.
  select count(*) into n from pg_policies
    where schemaname = 'public' and tablename = 'client_errors';
  insert into _rls_results values ('0 policies present', '2', n::text, n = 2);

  -- 2. Authenticated user inserts THEIR OWN row -> success.
  perform set_config('request.jwt.claims',
    json_build_object('sub', normal_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    insert into public.client_errors (user_id, kind, message)
    values (auth.uid(), 'rls-verify-own', 'own insert');
    ok := true;
  exception when others then
    ok := false;
  end;
  perform set_config('role', orig, true);
  insert into _rls_results values (
    '2 insert own row', 'success',
    case when ok then 'success' else 'blocked' end, ok);

  -- 3. Same user inserts AS SOMEONE ELSE -> blocked by the with-check.
  perform set_config('role', 'authenticated', true);
  begin
    insert into public.client_errors (user_id, kind, message)
    values (gen_random_uuid(), 'rls-verify-other', 'foreign insert');
    ok := false;  -- reaching here means the policy did NOT block it
  exception when others then
    ok := true;   -- any RLS rejection (42501) is the pass condition
  end;
  perform set_config('role', orig, true);
  insert into _rls_results values (
    '3 insert as other user', 'blocked',
    case when ok then 'blocked' else 'ALLOWED' end, ok);

  -- 4. Ordinary user cannot READ any rows (no non-admin SELECT policy exists).
  perform set_config('request.jwt.claims',
    json_build_object('sub', normal_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.client_errors;
  perform set_config('role', orig, true);
  insert into _rls_results values ('4 normal user reads', '0', n::text, n = 0);

  -- 5. Admin CAN read rows (sees at least the probe).
  perform set_config('request.jwt.claims',
    json_build_object('sub', admin_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.client_errors;
  perform set_config('role', orig, true);
  insert into _rls_results values ('5 admin reads', '>= 1', n::text, n >= 1);

  -- Cleanup: remove the probe and any verification inserts. No rows persist.
  delete from public.client_errors
    where kind in ('rls-verify-probe', 'rls-verify-own', 'rls-verify-other');
end $$;

select * from _rls_results order by step;
