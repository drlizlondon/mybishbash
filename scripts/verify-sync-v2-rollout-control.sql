-- Phase 6 Preflight Commit 0 executable database verifier.
--
-- Run only against an ephemeral/local database after applying
-- 202608010001_sync_v2_rollout_control.sql. The script creates synthetic auth
-- users, deliberately corrupts rollout configuration to exercise fail-closed
-- paths, and rolls the entire probe back. Hosted verification uses separate
-- read-only aggregate probes because staging and production share one database.

begin;

create temp table _sync_v2_probe_results (
  step text primary key,
  expected text not null,
  actual text not null,
  pass boolean not null
) on commit drop;

-- The verifier deliberately switches session roles. Granting those roles
-- access to this transaction-local result table keeps evidence recording
-- separate from the permissions being tested on the real rollout table.
grant select, insert on _sync_v2_probe_results to anon, authenticated;

do $$
declare
  original_role text := current_user;
  listed_tester_id uuid := gen_random_uuid();
  unlisted_tester_id uuid := gen_random_uuid();
  ordinary_id uuid := gen_random_uuid();
  staff_id uuid := gen_random_uuid();
  admin_id uuid := gen_random_uuid();
  assignment jsonb;
  first_generation bigint;
  second_generation bigint;
  denied boolean;
  stable_audience text;
  direct_policy_count integer;
begin
  insert into auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  values
    (listed_tester_id, 'authenticated', 'authenticated',
      concat('sync-v2-listed-', listed_tester_id, '@example.invalid'), '', now(),
      '{}'::jsonb, '{}'::jsonb, now(), now()),
    (unlisted_tester_id, 'authenticated', 'authenticated',
      concat('sync-v2-unlisted-', unlisted_tester_id, '@example.invalid'), '', now(),
      '{}'::jsonb, '{}'::jsonb, now(), now()),
    (ordinary_id, 'authenticated', 'authenticated',
      concat('sync-v2-ordinary-', ordinary_id, '@example.invalid'), '', now(),
      '{}'::jsonb, '{}'::jsonb, now(), now()),
    (staff_id, 'authenticated', 'authenticated',
      concat('sync-v2-staff-', staff_id, '@example.invalid'), '', now(),
      '{}'::jsonb, '{}'::jsonb, now(), now()),
    (admin_id, 'authenticated', 'authenticated',
      concat('sync-v2-admin-', admin_id, '@example.invalid'), '', now(),
      '{}'::jsonb, '{}'::jsonb, now(), now());

  update public.user_profiles
  set is_tester = true,
      tester_group = case
        when user_id = listed_tester_id then 'sync-v2-selected-probe'
        else 'sync-v2-unlisted-probe'
      end
  where user_id in (listed_tester_id, unlisted_tester_id);

  insert into public.admin_users (user_id, email, role)
  values
    (staff_id, concat('sync-v2-staff-', staff_id, '@example.invalid'), 'support'),
    (admin_id, concat('sync-v2-admin-', admin_id, '@example.invalid'), 'admin');

  -- The authenticated admin path can add only blob rules.
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', admin_id::text, 'role', 'authenticated')::text,
    true
  );
  perform set_config('role', 'authenticated', true);

  assignment := public.hq_set_sync_v2_rollout_rule(
    100, 'tester_group', 'sync-v2-selected-probe', 'listed-tester-blob',
    'blob', 1, 1, true
  );
  first_generation := (assignment->>'configGeneration')::bigint;

  assignment := public.hq_set_sync_v2_rollout_rule(
    200, 'staff', null, 'staff-blob', 'blob', 1, 1, true
  );
  second_generation := (assignment->>'configGeneration')::bigint;

  perform public.hq_set_sync_v2_rollout_rule(
    300, 'percentage', '0', 'percentage-zero-blob', 'blob', 1, 1, true
  );
  perform set_config('role', original_role, true);

  insert into _sync_v2_probe_results values (
    'configuration generation is monotonic',
    'second > first',
    concat(first_generation, ' -> ', second_generation),
    second_generation > first_generation
  );

  -- Listed tester account resolves to blob through the selected group rule.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', listed_tester_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  assignment := public.get_sync_v2_assignment(1, 1);
  perform set_config('role', original_role, true);
  insert into _sync_v2_probe_results values (
    'listed tester account', 'blob / listed-tester-blob',
    concat(assignment->>'mode', ' / ', assignment->>'audience'),
    assignment->>'mode' = 'blob' and assignment->>'readAuthority' = 'blob'
      and assignment->>'audience' = 'listed-tester-blob'
  );

  -- Unlisted tester account resolves to the catch-all blob rule.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', unlisted_tester_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  assignment := public.get_sync_v2_assignment(1, 1);
  perform set_config('role', original_role, true);
  insert into _sync_v2_probe_results values (
    'unlisted tester account', 'blob / catch-all-blob',
    concat(assignment->>'mode', ' / ', assignment->>'audience'),
    assignment->>'mode' = 'blob' and assignment->>'audience' = 'catch-all-blob'
  );

  -- Ordinary account resolves to the catch-all blob rule.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', ordinary_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  assignment := public.get_sync_v2_assignment(1, 1);
  perform set_config('role', original_role, true);
  insert into _sync_v2_probe_results values (
    'ordinary account', 'blob / catch-all-blob',
    concat(assignment->>'mode', ' / ', assignment->>'audience'),
    assignment->>'mode' = 'blob' and assignment->>'audience' = 'catch-all-blob'
  );

  -- Staff account resolves to blob; support cannot mutate configuration.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', staff_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  assignment := public.get_sync_v2_assignment(1, 1);
  begin
    perform public.hq_set_sync_v2_rollout_rule(
      400, 'all', null, 'forbidden-staff-write', 'blob', 1, 1, false
    );
    denied := false;
  exception when insufficient_privilege then
    denied := true;
  end;
  perform set_config('role', original_role, true);
  insert into _sync_v2_probe_results values (
    'staff account', 'blob / staff-blob',
    concat(assignment->>'mode', ' / ', assignment->>'audience'),
    assignment->>'mode' = 'blob' and assignment->>'audience' = 'staff-blob'
  );
  insert into _sync_v2_probe_results values (
    'staff configuration write', 'denied', case when denied then 'denied' else 'ALLOWED' end, denied
  );

  -- Admin account resolves to blob and the admin mutation above succeeded.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', admin_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  assignment := public.get_sync_v2_assignment(1, 1);
  perform set_config('role', original_role, true);
  insert into _sync_v2_probe_results values (
    'admin account', 'blob / staff-blob',
    concat(assignment->>'mode', ' / ', assignment->>'audience'),
    assignment->>'mode' = 'blob' and assignment->>'audience' = 'staff-blob'
  );

  -- A 100% rule is deterministic and lower priority than staff.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', admin_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.hq_set_sync_v2_rollout_rule(
    300, 'percentage', '100', 'percentage-full-blob', 'blob', 1, 1, true
  );
  perform set_config('role', original_role, true);

  perform set_config('request.jwt.claims', jsonb_build_object('sub', ordinary_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  assignment := public.get_sync_v2_assignment(1, 1);
  stable_audience := assignment->>'audience';
  assignment := public.get_sync_v2_assignment(1, 1);
  perform set_config('role', original_role, true);
  insert into _sync_v2_probe_results values (
    'stable percentage boundary', 'blob / percentage-full-blob twice',
    concat(assignment->>'mode', ' / ', stable_audience, ' / ', assignment->>'audience'),
    assignment->>'mode' = 'blob' and stable_audience = 'percentage-full-blob'
      and assignment->>'audience' = stable_audience
  );

  perform set_config('request.jwt.claims', jsonb_build_object('sub', staff_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  assignment := public.get_sync_v2_assignment(1, 1);
  perform set_config('role', original_role, true);
  insert into _sync_v2_probe_results values (
    'rule priority', 'staff-blob before percentage-full-blob', assignment->>'audience',
    assignment->>'mode' = 'blob' and assignment->>'audience' = 'staff-blob'
  );

  -- Unsupported and null protocol/schema values remain blob.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', ordinary_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  assignment := public.get_sync_v2_assignment(2, 1);
  insert into _sync_v2_probe_results values (
    'unsupported protocol', 'blob / unsupported_version',
    concat(assignment->>'mode', ' / ', assignment->>'reason'),
    assignment->>'mode' = 'blob' and assignment->>'reason' = 'unsupported_version'
  );
  assignment := public.get_sync_v2_assignment(1, null);
  perform set_config('role', original_role, true);
  insert into _sync_v2_probe_results values (
    'null schema version', 'blob / unsupported_version',
    concat(assignment->>'mode', ' / ', assignment->>'reason'),
    assignment->>'mode' = 'blob' and assignment->>'reason' = 'unsupported_version'
  );

  -- Missing configuration closes to blob.
  update public.sync_v2_rollout_rules set enabled = false where audience_kind = 'all';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', ordinary_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  assignment := public.get_sync_v2_assignment(1, 1);
  perform set_config('role', original_role, true);
  insert into _sync_v2_probe_results values (
    'missing configuration', 'blob / invalid_configuration',
    concat(assignment->>'mode', ' / ', assignment->>'reason'),
    assignment->>'mode' = 'blob' and assignment->>'reason' = 'invalid_configuration'
  );
  update public.sync_v2_rollout_rules set enabled = true where audience_kind = 'all';

  -- Contradictory catch-alls are malformed configuration and close to blob.
  drop index public.sync_v2_rollout_one_enabled_catch_all_idx;
  insert into public.sync_v2_rollout_rules (
    priority, audience_kind, audience_value, audience_label, mode,
    sync_protocol_version, entity_schema_version, generation, enabled
  ) values (999999, 'all', null, 'contradictory-catch-all', 'blob', 1, 1, 999999, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', ordinary_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  assignment := public.get_sync_v2_assignment(1, 1);
  perform set_config('role', original_role, true);
  insert into _sync_v2_probe_results values (
    'malformed configuration', 'blob / invalid_configuration',
    concat(assignment->>'mode', ' / ', assignment->>'reason'),
    assignment->>'mode' = 'blob' and assignment->>'reason' = 'invalid_configuration'
  );
  delete from public.sync_v2_rollout_rules where priority = 999999;
  create unique index sync_v2_rollout_one_enabled_catch_all_idx
    on public.sync_v2_rollout_rules ((audience_kind))
    where enabled and audience_kind = 'all';

  -- A malformed percentage causes an internal lookup error; the RPC catches it
  -- and still returns blob rather than surfacing or enabling another mode.
  alter table public.sync_v2_rollout_rules
    drop constraint sync_v2_rollout_rules_audience_value_check;
  update public.sync_v2_rollout_rules
  set audience_value = 'not-a-number'
  where priority = 300;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', ordinary_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  assignment := public.get_sync_v2_assignment(1, 1);
  perform set_config('role', original_role, true);
  insert into _sync_v2_probe_results values (
    'internal lookup error', 'blob / lookup_error',
    concat(assignment->>'mode', ' / ', assignment->>'reason'),
    assignment->>'mode' = 'blob' and assignment->>'reason' = 'lookup_error'
  );
  update public.sync_v2_rollout_rules set audience_value = '100' where priority = 300;
  alter table public.sync_v2_rollout_rules
    add constraint sync_v2_rollout_rules_audience_value_check check (
      case audience_kind
        when 'tester_group' then nullif(btrim(audience_value), '') is not null
        when 'staff' then audience_value is null
        when 'percentage' then audience_value ~ '^[0-9]{1,3}$'
          and audience_value::integer between 0 and 100
        when 'all' then audience_value is null
        else false
      end
    );

  -- Unauthenticated assignment is denied outside the fail-closed inner block.
  perform set_config('request.jwt.claims', '{}'::jsonb::text, true);
  perform set_config('role', 'anon', true);
  begin
    perform public.get_sync_v2_assignment(1, 1);
    denied := false;
  exception when insufficient_privilege then
    denied := true;
  end;
  perform set_config('role', original_role, true);
  insert into _sync_v2_probe_results values (
    'unauthenticated assignment', 'denied', case when denied then 'denied' else 'ALLOWED' end, denied
  );

  -- Ordinary authenticated users have neither direct table access nor config writes.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', ordinary_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform count(*) from public.sync_v2_rollout_rules;
    denied := false;
  exception when insufficient_privilege then
    denied := true;
  end;
  insert into _sync_v2_probe_results values (
    'ordinary direct rule read', 'denied', case when denied then 'denied' else 'ALLOWED' end, denied
  );
  begin
    insert into public.sync_v2_rollout_rules (
      priority, audience_kind, audience_label, mode,
      sync_protocol_version, entity_schema_version, generation
    ) values (500, 'all', 'forbidden-direct-write', 'blob', 1, 1, 500);
    denied := false;
  exception when insufficient_privilege then
    denied := true;
  end;
  insert into _sync_v2_probe_results values (
    'ordinary direct rule write', 'denied', case when denied then 'denied' else 'ALLOWED' end, denied
  );
  begin
    perform public.hq_set_sync_v2_rollout_rule(
      500, 'all', null, 'forbidden-non-admin-write', 'blob', 1, 1, false
    );
    denied := false;
  exception when insufficient_privilege then
    denied := true;
  end;
  perform set_config('role', original_role, true);
  insert into _sync_v2_probe_results values (
    'non-admin configuration write', 'denied', case when denied then 'denied' else 'ALLOWED' end, denied
  );

  -- A client-supplied non-blob mode cannot alter server authority.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', admin_id::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.hq_set_sync_v2_rollout_rule(
      500, 'all', null, 'client-mode-attempt', 'entities', 1, 1, false
    );
    denied := false;
  exception when invalid_parameter_value then
    denied := true;
  end;
  insert into _sync_v2_probe_results values (
    'client mode selection', 'denied', case when denied then 'denied' else 'ALLOWED' end, denied
  );

  -- The approved admin reset restores the exact one-row default configuration.
  perform public.hq_reset_sync_v2_rollout_rules();
  perform set_config('role', original_role, true);
  insert into _sync_v2_probe_results
  select
    'exact default restore',
    'one enabled catch-all blob row',
    concat('rows=', count(*), ', exact=', count(*) filter (
      where priority = 1000000 and audience_kind = 'all'
        and audience_value is null
        and audience_label = 'catch-all-blob' and mode = 'blob'
        and sync_protocol_version = 1 and entity_schema_version = 1
        and generation >= 1 and enabled
    )),
    count(*) = 1 and count(*) filter (
      where priority = 1000000 and audience_kind = 'all'
        and audience_value is null
        and audience_label = 'catch-all-blob' and mode = 'blob'
        and sync_protocol_version = 1 and entity_schema_version = 1
        and generation >= 1 and enabled
    ) = 1
  from public.sync_v2_rollout_rules;

  select count(*) into direct_policy_count
  from pg_catalog.pg_policies
  where schemaname = 'public' and tablename = 'sync_v2_rollout_rules';
  insert into _sync_v2_probe_results values (
    'direct client policies', '0', direct_policy_count::text, direct_policy_count = 0
  );
end;
$$;

select step, expected, actual, pass
from _sync_v2_probe_results
order by step;

do $$
declare
  failed_steps text;
begin
  select string_agg(step, ', ' order by step)
  into failed_steps
  from _sync_v2_probe_results
  where not pass;

  if failed_steps is not null then
    raise exception 'Sync v2 rollout verification failed: %', failed_steps;
  end if;

  raise notice 'Sync v2 rollout verification passed: % checks',
    (select count(*) from _sync_v2_probe_results);
end;
$$;

rollback;
