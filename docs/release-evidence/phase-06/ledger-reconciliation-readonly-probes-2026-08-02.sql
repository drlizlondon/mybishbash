-- Phase 6 migration-ledger reconciliation: durable read-only probe evidence.
--
-- SELECT-only hosted inspection; no DDL or persistent DML.
-- Project ref: ifcgomivmzwqqxhltfjj
-- Repository source SHA: ec4f7159803119ec9c613f98550506adc463022c
-- Execution: the rollout posture and four assignment inputs below were
-- executed before and after the 202608010001 migration-ledger repair on
-- 2026-08-02. The target-ledger input was executed after repair.
--
-- Original input and SHA-256:
--   rollout-schema-posture.sql
--     3fb1999a4bea978370cd3410bacdebef0178b153a3c416f7f42e8a95881accfe
--   assignment-grouped.sql
--     806c48455dabd34769399418dba3b3e3e2f60728f1aa52e00942a2d405ea23a8
--   assignment-unassigned.sql
--     f774267a3056a7c7016804223af80a679634f1b141510288d8defbb68e886499
--   assignment-ordinary.sql
--     a177a45072ae62e2992c477fef024c05d7ea0f3940c2fdab2b6da7bb3a03a1f6
--   assignment-operator.sql
--     b38cf3aec0f70364180e7d88f802da8af3c3d0f6a7c74a46cf3e0ff15ffc6e6f
--   ledger-target-postcheck.sql
--     be4476230c55696d7fda4245ef06c4679c01affee5f5a5fd7a8b146b770df277

-- Original input: rollout-schema-posture.sql
-- One-result-set, read-only rollout schema and access posture.
with
table_definition as (
  select string_agg(
    concat_ws('|',
      attributes.attnum::text,
      attributes.attname,
      pg_catalog.format_type(attributes.atttypid, attributes.atttypmod),
      attributes.attnotnull::text,
      coalesce(pg_catalog.pg_get_expr(defaults.adbin, defaults.adrelid), '')
    ), E'\n' order by attributes.attnum
  ) as value
  from pg_catalog.pg_attribute attributes
  join pg_catalog.pg_class tables on tables.oid = attributes.attrelid
  join pg_catalog.pg_namespace schemas on schemas.oid = tables.relnamespace
  left join pg_catalog.pg_attrdef defaults
    on defaults.adrelid = attributes.attrelid
   and defaults.adnum = attributes.attnum
  where schemas.nspname = 'public'
    and tables.relname = 'sync_v2_rollout_rules'
    and attributes.attnum > 0
    and not attributes.attisdropped
),
constraint_definition as (
  select string_agg(
    concat_ws('|', constraints.conname, pg_catalog.pg_get_constraintdef(constraints.oid, true)),
    E'\n' order by constraints.conname
  ) as value
  from pg_catalog.pg_constraint constraints
  join pg_catalog.pg_class tables on tables.oid = constraints.conrelid
  join pg_catalog.pg_namespace schemas on schemas.oid = tables.relnamespace
  where schemas.nspname = 'public'
    and tables.relname = 'sync_v2_rollout_rules'
),
index_definition as (
  select string_agg(
    concat_ws('|', indexes.relname, pg_catalog.pg_get_indexdef(indexes.oid)),
    E'\n' order by indexes.relname
  ) as value
  from pg_catalog.pg_class tables
  join pg_catalog.pg_namespace schemas on schemas.oid = tables.relnamespace
  join pg_catalog.pg_index table_indexes on table_indexes.indrelid = tables.oid
  join pg_catalog.pg_class indexes on indexes.oid = table_indexes.indexrelid
  where schemas.nspname = 'public'
    and tables.relname = 'sync_v2_rollout_rules'
),
table_security as (
  select concat_ws('|',
    tables.relrowsecurity::text,
    tables.relforcerowsecurity::text,
    coalesce(tables.relacl::text, ''),
    coalesce((
      select string_agg(
        concat_ws('|', policies.policyname, policies.roles::text, policies.cmd,
          coalesce(policies.qual, ''), coalesce(policies.with_check, '')),
        E'\n' order by policies.policyname
      )
      from pg_catalog.pg_policies policies
      where policies.schemaname = 'public'
        and policies.tablename = 'sync_v2_rollout_rules'
    ), '')
  ) as value
  from pg_catalog.pg_class tables
  join pg_catalog.pg_namespace schemas on schemas.oid = tables.relnamespace
  where schemas.nspname = 'public'
    and tables.relname = 'sync_v2_rollout_rules'
),
function_definition as (
  select string_agg(
    concat_ws('|',
      functions.oid::regprocedure::text,
      functions.prosecdef::text,
      coalesce(functions.proconfig::text, ''),
      coalesce(functions.proacl::text, ''),
      pg_catalog.pg_get_functiondef(functions.oid)
    ), E'\n' order by functions.oid::regprocedure::text
  ) as value
  from pg_catalog.pg_proc functions
  where functions.oid in (
    'public.get_sync_v2_assignment(integer,integer)'::regprocedure,
    'public.hq_set_sync_v2_rollout_rule(integer,text,text,text,text,integer,integer,boolean)'::regprocedure,
    'public.hq_reset_sync_v2_rollout_rules()'::regprocedure
  )
),
rule_stats as (
  select
    count(*) as total_rules,
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
    ) as exact_default_rules,
    count(*) filter (where mode <> 'blob') as non_blob,
    min(generation) as generation,
    bool_and(enabled) as all_enabled
  from public.sync_v2_rollout_rules
),
access_posture as (
  select
    tables.relrowsecurity as rls_enabled,
    tables.relforcerowsecurity as force_rls,
    (select count(*) from pg_catalog.pg_policies policies
     where policies.schemaname = 'public'
       and policies.tablename = 'sync_v2_rollout_rules') as policy_count,
    has_table_privilege('anon', 'public.sync_v2_rollout_rules', 'select') as anon_table_select,
    has_table_privilege('authenticated', 'public.sync_v2_rollout_rules', 'select') as authenticated_table_select,
    has_function_privilege('anon', 'public.get_sync_v2_assignment(integer,integer)', 'execute') as anon_assignment_execute,
    has_function_privilege('authenticated', 'public.get_sync_v2_assignment(integer,integer)', 'execute') as authenticated_assignment_execute,
    has_function_privilege('anon', 'public.hq_set_sync_v2_rollout_rule(integer,text,text,text,text,integer,integer,boolean)', 'execute') as anon_admin_execute,
    has_function_privilege('authenticated', 'public.hq_set_sync_v2_rollout_rule(integer,text,text,text,text,integer,integer,boolean)', 'execute') as authenticated_admin_execute
  from pg_catalog.pg_class tables
  join pg_catalog.pg_namespace schemas on schemas.oid = tables.relnamespace
  where schemas.nspname = 'public'
    and tables.relname = 'sync_v2_rollout_rules'
)
select
  md5(concat_ws(E'\n--section--\n',
    table_definition.value,
    constraint_definition.value,
    index_definition.value,
    table_security.value,
    function_definition.value
  )) as rollout_schema_fingerprint,
  rule_stats.*,
  access_posture.*
from table_definition, constraint_definition, index_definition,
  table_security, function_definition, rule_stats, access_posture;

-- Original input: assignment-grouped.sql
with candidate as materialized (
  select profiles.user_id
  from public.user_profiles profiles
  where profiles.is_tester = true
    and nullif(btrim(profiles.tester_group), '') is not null
    and not exists (
      select 1 from public.admin_users admins where admins.user_id = profiles.user_id
    )
  order by profiles.last_seen_at desc
  limit 1
), auth_context as materialized (
  select set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', candidate.user_id::text, 'role', 'authenticated')::text,
    true
  ) as claims
  from candidate
)
select 'grouped_tester' as category,
  assignment->>'mode' as mode,
  assignment->>'readAuthority' as read_authority,
  assignment->>'audience' as audience,
  assignment->>'reason' as reason
from auth_context
cross join lateral public.get_sync_v2_assignment(1, 1) assignment
where auth_context.claims is not null;

-- Original input: ledger-target-postcheck.sql
-- SELECT-only target migration-ledger verification, 2026-08-02.
select
  version,
  name,
  cardinality(statements) as statement_count
from supabase_migrations.schema_migrations
where version = '202608010001';

-- Original input: assignment-unassigned.sql
with candidate as materialized (
  select profiles.user_id
  from public.user_profiles profiles
  where profiles.is_tester = true
    and nullif(btrim(profiles.tester_group), '') is null
    and not exists (
      select 1 from public.admin_users admins where admins.user_id = profiles.user_id
    )
  order by profiles.last_seen_at desc
  limit 1
), auth_context as materialized (
  select set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', candidate.user_id::text, 'role', 'authenticated')::text,
    true
  ) as claims
  from candidate
)
select 'unassigned_tester' as category,
  assignment->>'mode' as mode,
  assignment->>'readAuthority' as read_authority,
  assignment->>'audience' as audience,
  assignment->>'reason' as reason
from auth_context
cross join lateral public.get_sync_v2_assignment(1, 1) assignment
where auth_context.claims is not null;

-- Original input: assignment-ordinary.sql
with candidate as materialized (
  select profiles.user_id
  from public.user_profiles profiles
  where profiles.is_tester = false
    and not exists (
      select 1 from public.admin_users admins where admins.user_id = profiles.user_id
    )
  order by profiles.last_seen_at desc
  limit 1
), auth_context as materialized (
  select set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', candidate.user_id::text, 'role', 'authenticated')::text,
    true
  ) as claims
  from candidate
)
select 'non_tester_non_operator' as category,
  assignment->>'mode' as mode,
  assignment->>'readAuthority' as read_authority,
  assignment->>'audience' as audience,
  assignment->>'reason' as reason
from auth_context
cross join lateral public.get_sync_v2_assignment(1, 1) assignment
where auth_context.claims is not null;

-- Original input: assignment-operator.sql
with candidate as materialized (
  select admins.user_id
  from public.admin_users admins
  order by case admins.role when 'owner' then 0 when 'admin' then 1 else 2 end, admins.user_id
  limit 1
), auth_context as materialized (
  select set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', candidate.user_id::text, 'role', 'authenticated')::text,
    true
  ) as claims
  from candidate
)
select 'operator' as category,
  assignment->>'mode' as mode,
  assignment->>'readAuthority' as read_authority,
  assignment->>'audience' as audience,
  assignment->>'reason' as reason
from auth_context
cross join lateral public.get_sync_v2_assignment(1, 1) assignment
where auth_context.claims is not null;
