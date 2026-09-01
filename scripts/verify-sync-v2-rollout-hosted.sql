-- Phase 6 Preflight Commit 0 hosted assignment probe.
--
-- TARGET: shared Supabase project ifcgomivmzwqqxhltfjj (production database).
-- This probe never changes a user profile and every temporary rollout rule is
-- schema-constrained to blob. It uses the audited owner/admin RPC to add blob
-- tester/staff rules, proves matching with distinct listed/unlisted tester
-- accounts, and uses a distinct non-admin staff account when one exists. If
-- the hosted project has no such account, the staff audience is labelled as
-- exercised through the owner/admin membership that the RPC actually checks.
-- The probe commits the audited exact-default reset. Output contains no email,
-- user id, tester-group value, credential, or token.

begin;

create temp table if not exists _sync_v2_hosted_probe_results (
  category text primary key,
  expected text not null,
  actual text not null,
  pass boolean not null
);
truncate _sync_v2_hosted_probe_results;
grant select, insert on _sync_v2_hosted_probe_results to anon, authenticated;

do $$
declare
  original_role text := current_user;
  operator_id uuid;
  staff_id uuid;
  staff_is_distinct boolean;
  selected_tester_id uuid;
  selected_tester_group text;
  unlisted_tester_id uuid;
  ordinary_id uuid;
  assignment jsonb;
  denied boolean;
  total_rules integer;
  enabled_catch_all integer;
  non_blob_rules integer;
  exact_default_rules integer;
  rls_enabled boolean;
  policy_count integer;
begin
  select admins.user_id
  into operator_id
  from public.admin_users admins
  where admins.role in ('owner', 'admin')
  order by case admins.role when 'owner' then 0 else 1 end, admins.user_id
  limit 1;

  select admins.user_id
  into staff_id
  from public.admin_users admins
  where admins.role not in ('owner', 'admin')
    and admins.user_id <> operator_id
  order by admins.role, admins.user_id
  limit 1;

  staff_is_distinct := staff_id is not null;
  staff_id := coalesce(staff_id, operator_id);

  select profiles.user_id, btrim(profiles.tester_group)
  into selected_tester_id, selected_tester_group
  from public.user_profiles profiles
  where profiles.is_tester = true
    and nullif(btrim(profiles.tester_group), '') is not null
    and not exists (
      select 1 from public.admin_users admins where admins.user_id = profiles.user_id
    )
  order by profiles.last_seen_at desc
  limit 1;

  select profiles.user_id
  into unlisted_tester_id
  from public.user_profiles profiles
  where profiles.is_tester = true
    and profiles.user_id <> selected_tester_id
    and profiles.tester_group is distinct from selected_tester_group
    and not exists (
      select 1 from public.admin_users admins where admins.user_id = profiles.user_id
    )
  order by profiles.last_seen_at desc
  limit 1;

  select profiles.user_id
  into ordinary_id
  from public.user_profiles profiles
  where profiles.is_tester = false
    and not exists (
      select 1 from public.admin_users admins where admins.user_id = profiles.user_id
    )
  order by profiles.last_seen_at desc
  limit 1;

  if operator_id is null or selected_tester_id is null
    or selected_tester_group is null or unlisted_tester_id is null
    or ordinary_id is null then
    raise exception 'Distinct hosted rollout probe prerequisites are not present';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', operator_id::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('role', 'authenticated', true);
  perform public.hq_set_sync_v2_rollout_rule(
    100,
    'tester_group',
    selected_tester_group,
    'hosted-listed-tester-blob',
    'blob',
    1,
    1,
    true
  );
  perform public.hq_set_sync_v2_rollout_rule(
    200,
    'staff',
    null,
    'hosted-staff-blob',
    'blob',
    1,
    1,
    true
  );
  perform set_config('role', original_role, true);

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', selected_tester_id::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('role', 'authenticated', true);
  assignment := public.get_sync_v2_assignment(1, 1);
  perform set_config('role', original_role, true);
  insert into _sync_v2_hosted_probe_results values (
    'listed tester account',
    'blob / hosted-listed-tester-blob',
    concat(assignment->>'mode', ' / ', assignment->>'audience'),
    assignment->>'mode' = 'blob'
      and assignment->>'readAuthority' = 'blob'
      and assignment->>'audience' = 'hosted-listed-tester-blob'
  );

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', unlisted_tester_id::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('role', 'authenticated', true);
  assignment := public.get_sync_v2_assignment(1, 1);
  perform set_config('role', original_role, true);
  insert into _sync_v2_hosted_probe_results values (
    'unlisted tester account',
    'blob / catch-all-blob',
    concat(assignment->>'mode', ' / ', assignment->>'audience'),
    assignment->>'mode' = 'blob'
      and assignment->>'readAuthority' = 'blob'
      and assignment->>'audience' = 'catch-all-blob'
  );

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', ordinary_id::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('role', 'authenticated', true);
  assignment := public.get_sync_v2_assignment(1, 1);
  perform set_config('role', original_role, true);
  insert into _sync_v2_hosted_probe_results values (
    'ordinary account',
    'blob / catch-all-blob',
    concat(assignment->>'mode', ' / ', assignment->>'audience'),
    assignment->>'mode' = 'blob'
      and assignment->>'readAuthority' = 'blob'
      and assignment->>'audience' = 'catch-all-blob'
  );

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', staff_id::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('role', 'authenticated', true);
  assignment := public.get_sync_v2_assignment(1, 1);
  perform set_config('role', original_role, true);
  insert into _sync_v2_hosted_probe_results values (
    case
      when staff_is_distinct then 'staff account'
      else 'staff audience (owner/admin member)'
    end,
    'blob / hosted-staff-blob',
    concat(assignment->>'mode', ' / ', assignment->>'audience'),
    assignment->>'mode' = 'blob'
      and assignment->>'readAuthority' = 'blob'
      and assignment->>'audience' = 'hosted-staff-blob'
  );

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', operator_id::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('role', 'authenticated', true);
  assignment := public.get_sync_v2_assignment(1, 1);
  perform set_config('role', original_role, true);
  insert into _sync_v2_hosted_probe_results values (
    'admin account',
    'blob / hosted-staff-blob',
    concat(assignment->>'mode', ' / ', assignment->>'audience'),
    assignment->>'mode' = 'blob'
      and assignment->>'readAuthority' = 'blob'
      and assignment->>'audience' = 'hosted-staff-blob'
  );

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', ordinary_id::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('role', 'authenticated', true);
  begin
    perform public.hq_set_sync_v2_rollout_rule(
      400, 'all', null, 'forbidden-hosted-write', 'blob', 1, 1, false
    );
    denied := false;
  exception when insufficient_privilege then
    denied := true;
  end;
  perform set_config('role', original_role, true);
  insert into _sync_v2_hosted_probe_results values (
    'non-admin configuration write',
    'denied',
    case when denied then 'denied' else 'ALLOWED' end,
    denied
  );

  perform set_config('request.jwt.claims', '{}'::jsonb::text, true);
  perform set_config('role', 'anon', true);
  begin
    perform public.get_sync_v2_assignment(1, 1);
    denied := false;
  exception when insufficient_privilege then
    denied := true;
  end;
  perform set_config('role', original_role, true);
  insert into _sync_v2_hosted_probe_results values (
    'unauthenticated assignment',
    'denied',
    case when denied then 'denied' else 'ALLOWED' end,
    denied
  );

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', operator_id::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('role', 'authenticated', true);
  perform public.hq_reset_sync_v2_rollout_rules();
  perform set_config('role', original_role, true);

  select
    count(*),
    count(*) filter (where enabled and audience_kind = 'all'),
    count(*) filter (where mode <> 'blob'),
    count(*) filter (
      where priority = 1000000
        and audience_kind = 'all'
        and audience_value is null
        and audience_label = 'catch-all-blob'
        and mode = 'blob'
        and sync_protocol_version = 1
        and entity_schema_version = 1
        and generation >= 1
        and enabled
    )
  into total_rules, enabled_catch_all, non_blob_rules, exact_default_rules
  from public.sync_v2_rollout_rules;

  select tables.relrowsecurity
  into rls_enabled
  from pg_catalog.pg_class tables
  join pg_catalog.pg_namespace schemas on schemas.oid = tables.relnamespace
  where schemas.nspname = 'public'
    and tables.relname = 'sync_v2_rollout_rules';

  select count(*)
  into policy_count
  from pg_catalog.pg_policies
  where schemaname = 'public' and tablename = 'sync_v2_rollout_rules';

  insert into _sync_v2_hosted_probe_results values
    (
      'exact default restore',
      'one enabled catch-all blob rule',
      concat(
        'rules=', total_rules,
        ', exact=', exact_default_rules,
        ', non_blob=', non_blob_rules
      ),
      total_rules = 1
        and enabled_catch_all = 1
        and non_blob_rules = 0
        and exact_default_rules = 1
    ),
    (
      'RLS and direct policies',
      'RLS on / 0 policies',
      concat('RLS=', rls_enabled, ', policies=', policy_count),
      rls_enabled and policy_count = 0
    ),
    (
      'authenticated direct table read',
      'denied',
      case
        when has_table_privilege('authenticated', 'public.sync_v2_rollout_rules', 'select')
          then 'ALLOWED'
        else 'denied'
      end,
      not has_table_privilege('authenticated', 'public.sync_v2_rollout_rules', 'select')
    ),
    (
      'anon assignment execute',
      'denied',
      case
        when has_function_privilege('anon', 'public.get_sync_v2_assignment(integer, integer)', 'execute')
          then 'ALLOWED'
        else 'denied'
      end,
      not has_function_privilege('anon', 'public.get_sync_v2_assignment(integer, integer)', 'execute')
    );
end;
$$;

do $$
declare
  failed_categories text;
begin
  select string_agg(category, ', ' order by category)
  into failed_categories
  from _sync_v2_hosted_probe_results
  where not pass;

  if failed_categories is not null then
    raise exception 'Hosted Sync v2 rollout probe failed: %', failed_categories;
  end if;
end;
$$;

commit;

select category, expected, actual, pass
from _sync_v2_hosted_probe_results
order by category;
