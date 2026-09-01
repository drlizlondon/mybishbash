-- Phase 6 Preflight Commit 0: independent Sync v2 rollout control.
--
-- Production and staging share this Supabase project. This migration is
-- therefore production-impacting, but it is deliberately incapable of
-- enabling Sync v2: every stored rule and every assignment result is `blob`.
-- A later, separately reviewed migration must loosen the blob-only checks
-- before shadow/entity modes can exist.

create table if not exists public.sync_v2_rollout_rules (
  id uuid primary key default gen_random_uuid(),
  priority integer not null,
  audience_kind text not null,
  audience_value text,
  audience_label text not null,
  mode text not null default 'blob',
  sync_protocol_version integer not null default 1,
  entity_schema_version integer not null default 1,
  generation bigint not null default 1,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sync_v2_rollout_rules_priority_key unique (priority),
  constraint sync_v2_rollout_rules_priority_check check (priority >= 0),
  constraint sync_v2_rollout_rules_audience_kind_check
    check (audience_kind in ('tester_group', 'staff', 'percentage', 'all')),
  constraint sync_v2_rollout_rules_audience_value_check check (
    case audience_kind
      when 'tester_group' then nullif(btrim(audience_value), '') is not null
      when 'staff' then audience_value is null
      when 'percentage' then
        audience_value ~ '^[0-9]{1,3}$'
        and audience_value::integer between 0 and 100
      when 'all' then audience_value is null
      else false
    end
  ),
  constraint sync_v2_rollout_rules_label_check
    check (nullif(btrim(audience_label), '') is not null),
  constraint sync_v2_rollout_rules_preflight_mode_check check (mode = 'blob'),
  constraint sync_v2_rollout_rules_preflight_protocol_check
    check (sync_protocol_version = 1),
  constraint sync_v2_rollout_rules_preflight_schema_check
    check (entity_schema_version = 1),
  constraint sync_v2_rollout_rules_generation_check check (generation > 0)
);

comment on table public.sync_v2_rollout_rules is
  'Server-owned ordered Sync v2 audience rules. Preflight is blob-only; later modes require a new reviewed migration.';
comment on column public.sync_v2_rollout_rules.audience_value is
  'tester_group name, percentage 0..100, or NULL for staff/all.';
comment on column public.sync_v2_rollout_rules.generation is
  'Server-owned monotonic configuration generation; never supplied by clients.';

create unique index if not exists sync_v2_rollout_one_enabled_catch_all_idx
  on public.sync_v2_rollout_rules ((audience_kind))
  where enabled and audience_kind = 'all';

alter table public.sync_v2_rollout_rules enable row level security;

-- No direct client table surface. Reads happen only inside the assignment RPC;
-- owner/admin changes happen only through the audited configuration RPC.
revoke all on table public.sync_v2_rollout_rules from public, anon, authenticated;

insert into public.sync_v2_rollout_rules (
  priority,
  audience_kind,
  audience_value,
  audience_label,
  mode,
  sync_protocol_version,
  entity_schema_version,
  generation,
  enabled
)
values (
  1000000,
  'all',
  null,
  'catch-all-blob',
  'blob',
  1,
  1,
  1,
  true
)
on conflict (priority) do update
set audience_kind = 'all',
    audience_value = null,
    audience_label = 'catch-all-blob',
    mode = 'blob',
    sync_protocol_version = 1,
    entity_schema_version = 1,
    generation = greatest(public.sync_v2_rollout_rules.generation, 1),
    enabled = true,
    updated_at = now();

create or replace function public.get_sync_v2_assignment(
  sync_protocol_version integer,
  entity_schema_version integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid;
  selected_rule public.sync_v2_rollout_rules%rowtype;
  catch_all_count integer;
  config_generation bigint;
  percentage_bucket integer;
  safe_assignment jsonb;
begin
  caller_id := auth.uid();
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  safe_assignment := jsonb_build_object(
    'mode', 'blob',
    'readAuthority', 'blob',
    'audience', 'preflight-fallback',
    'configGeneration', '0',
    'ownerOverrideGeneration', null,
    'rollbackGeneration', null,
    'syncProtocolVersion', 1,
    'entitySchemaVersion', 1,
    'reason', 'fail_closed'
  );

  begin
    if sync_protocol_version is distinct from 1
      or entity_schema_version is distinct from 1 then
      return safe_assignment || jsonb_build_object('reason', 'unsupported_version');
    end if;

    select
      count(*) filter (where enabled and audience_kind = 'all'),
      coalesce(max(generation), 0)
    into catch_all_count, config_generation
    from public.sync_v2_rollout_rules;

    -- Missing or contradictory catch-all configuration is never interpreted
    -- as permission to leave the legacy blob path.
    if catch_all_count <> 1 then
      return safe_assignment || jsonb_build_object(
        'configGeneration', config_generation::text,
        'reason', 'invalid_configuration'
      );
    end if;

    percentage_bucket := (
      ('x' || substr(md5(caller_id::text), 1, 8))::bit(32)::bigint % 100
    )::integer;

    select rules.*
    into selected_rule
    from public.sync_v2_rollout_rules rules
    where rules.enabled
      and rules.sync_protocol_version = 1
      and rules.entity_schema_version = 1
      and case rules.audience_kind
        when 'tester_group' then exists (
          select 1
          from public.user_profiles profiles
          where profiles.user_id = caller_id
            and profiles.is_tester = true
            and profiles.tester_group = rules.audience_value
        )
        when 'staff' then exists (
          select 1
          from public.admin_users admins
          where admins.user_id = caller_id
        )
        when 'percentage' then percentage_bucket < rules.audience_value::integer
        when 'all' then true
        else false
      end
    order by rules.priority asc
    limit 1;

    -- Defence in depth: even a future malformed row cannot make this preflight
    -- function return a non-blob mode.
    if selected_rule.id is null or selected_rule.mode <> 'blob' then
      return safe_assignment || jsonb_build_object(
        'configGeneration', config_generation::text,
        'reason', 'invalid_assignment'
      );
    end if;

    return safe_assignment || jsonb_build_object(
      'audience', selected_rule.audience_label,
      'configGeneration', config_generation::text,
      'reason', 'matched_rule'
    );
  exception when others then
    return safe_assignment || jsonb_build_object('reason', 'lookup_error');
  end;
end;
$$;

revoke execute on function public.get_sync_v2_assignment(integer, integer)
  from public, anon;
grant execute on function public.get_sync_v2_assignment(integer, integer)
  to authenticated;

create or replace function public.hq_set_sync_v2_rollout_rule(
  p_priority integer,
  p_audience_kind text,
  p_audience_value text,
  p_audience_label text,
  p_mode text,
  p_sync_protocol_version integer,
  p_entity_schema_version integer,
  p_enabled boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  admin_email text;
  normalized_value text;
  previous_rule jsonb;
  next_generation bigint;
begin
  select admins.email
  into admin_email
  from public.admin_users admins
  where admins.user_id = auth.uid()
    and admins.role in ('owner', 'admin');

  if admin_email is null then
    raise exception 'Only owner/admin HQ roles can manage Sync v2 rollout rules'
      using errcode = '42501';
  end if;

  if p_mode is distinct from 'blob' then
    raise exception 'Preflight rollout rules must remain in blob mode'
      using errcode = '22023';
  end if;

  if p_priority is null or p_priority < 0
    or p_audience_kind is null
    or p_audience_kind not in ('tester_group', 'staff', 'percentage', 'all')
    or nullif(btrim(p_audience_label), '') is null
    or p_sync_protocol_version is distinct from 1
    or p_entity_schema_version is distinct from 1 then
    raise exception 'Invalid Sync v2 rollout rule' using errcode = '22023';
  end if;

  normalized_value := nullif(btrim(coalesce(p_audience_value, '')), '');

  if (p_audience_kind = 'tester_group' and normalized_value is null)
    or (p_audience_kind in ('staff', 'all') and normalized_value is not null)
    or (
      p_audience_kind = 'percentage'
      and (
        normalized_value is null
        or normalized_value !~ '^[0-9]{1,3}$'
        or normalized_value::integer not between 0 and 100
      )
    ) then
    raise exception 'Invalid Sync v2 audience value' using errcode = '22023';
  end if;

  lock table public.sync_v2_rollout_rules in share row exclusive mode;

  select to_jsonb(rules) - 'id' - 'created_at' - 'updated_at'
  into previous_rule
  from public.sync_v2_rollout_rules rules
  where rules.priority = p_priority;

  select coalesce(max(rules.generation), 0) + 1
  into next_generation
  from public.sync_v2_rollout_rules rules;

  insert into public.sync_v2_rollout_rules (
    priority,
    audience_kind,
    audience_value,
    audience_label,
    mode,
    sync_protocol_version,
    entity_schema_version,
    generation,
    enabled
  )
  values (
    p_priority,
    p_audience_kind,
    case when p_audience_kind in ('staff', 'all') then null else normalized_value end,
    btrim(p_audience_label),
    'blob',
    1,
    1,
    next_generation,
    coalesce(p_enabled, false)
  )
  on conflict (priority) do update
  set
    audience_kind = excluded.audience_kind,
    audience_value = excluded.audience_value,
    audience_label = excluded.audience_label,
    mode = 'blob',
    sync_protocol_version = 1,
    entity_schema_version = 1,
    generation = excluded.generation,
    enabled = excluded.enabled,
    updated_at = now();

  insert into public.access_audit_log (
    changed_by,
    action,
    old_values,
    new_values,
    reason
  )
  select
    admin_email,
    'sync_v2_rollout_rule_change',
    previous_rule,
    to_jsonb(rules) - 'id' - 'created_at' - 'updated_at',
    'Phase 6 preflight: blob-only rollout control'
  from public.sync_v2_rollout_rules rules
  where rules.priority = p_priority;

  return jsonb_build_object(
    'status', 'updated',
    'priority', p_priority,
    'mode', 'blob',
    'configGeneration', next_generation::text
  );
end;
$$;

revoke execute on function public.hq_set_sync_v2_rollout_rule(
  integer, text, text, text, text, integer, integer, boolean
) from public, anon;
grant execute on function public.hq_set_sync_v2_rollout_rule(
  integer, text, text, text, text, integer, integer, boolean
) to authenticated;

-- The focused verifier changes a rule and then proves this path restores the
-- literal one-row default. It is also the pre-Commit-1 incident reset: there is
-- no delete surface for arbitrary client-supplied rules.
create or replace function public.hq_reset_sync_v2_rollout_rules()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  admin_email text;
  previous_rules jsonb;
  next_generation bigint;
begin
  select admins.email
  into admin_email
  from public.admin_users admins
  where admins.user_id = auth.uid()
    and admins.role in ('owner', 'admin');

  if admin_email is null then
    raise exception 'Only owner/admin HQ roles can reset Sync v2 rollout rules'
      using errcode = '42501';
  end if;

  lock table public.sync_v2_rollout_rules in share row exclusive mode;

  select
    coalesce(
      jsonb_agg(
        to_jsonb(rules) - 'id' - 'created_at' - 'updated_at'
        order by rules.priority
      ),
      '[]'::jsonb
    ),
    coalesce(max(rules.generation), 0) + 1
  into previous_rules, next_generation
  from public.sync_v2_rollout_rules rules;

  delete from public.sync_v2_rollout_rules;

  insert into public.sync_v2_rollout_rules (
    priority,
    audience_kind,
    audience_value,
    audience_label,
    mode,
    sync_protocol_version,
    entity_schema_version,
    generation,
    enabled
  )
  values (
    1000000,
    'all',
    null,
    'catch-all-blob',
    'blob',
    1,
    1,
    next_generation,
    true
  );

  insert into public.access_audit_log (
    changed_by,
    action,
    old_values,
    new_values,
    reason
  )
  values (
    admin_email,
    'sync_v2_rollout_rules_reset',
    jsonb_build_object('rules', previous_rules),
    jsonb_build_object(
      'rules', jsonb_build_array(jsonb_build_object(
        'priority', 1000000,
        'audience_kind', 'all',
        'audience_value', null,
        'audience_label', 'catch-all-blob',
        'mode', 'blob',
        'sync_protocol_version', 1,
        'entity_schema_version', 1,
        'generation', next_generation,
        'enabled', true
      ))
    ),
    'Phase 6 preflight: exact default-blob reset'
  );

  return jsonb_build_object(
    'status', 'reset',
    'mode', 'blob',
    'configGeneration', next_generation::text
  );
end;
$$;

revoke execute on function public.hq_reset_sync_v2_rollout_rules()
  from public, anon;
grant execute on function public.hq_reset_sync_v2_rollout_rules()
  to authenticated;

-- Refuse to report a successful migration if a prior/manual object concealed
-- schema drift or if the required fail-closed posture was not installed.
do $$
declare
  expected_constraints text[] := array[
    'sync_v2_rollout_rules_audience_kind_check',
    'sync_v2_rollout_rules_audience_value_check',
    'sync_v2_rollout_rules_generation_check',
    'sync_v2_rollout_rules_label_check',
    'sync_v2_rollout_rules_preflight_mode_check',
    'sync_v2_rollout_rules_preflight_protocol_check',
    'sync_v2_rollout_rules_preflight_schema_check',
    'sync_v2_rollout_rules_priority_check',
    'sync_v2_rollout_rules_priority_key',
    'sync_v2_rollout_rules_pkey'
  ];
  present_constraints integer;
  enabled_catch_all_count integer;
  non_blob_count integer;
  rls_enabled boolean;
begin
  select count(*)
  into present_constraints
  from pg_catalog.pg_constraint constraints
  join pg_catalog.pg_class tables on tables.oid = constraints.conrelid
  join pg_catalog.pg_namespace schemas on schemas.oid = tables.relnamespace
  where schemas.nspname = 'public'
    and tables.relname = 'sync_v2_rollout_rules'
    and constraints.conname = any(expected_constraints);

  select
    count(*) filter (where enabled and audience_kind = 'all'),
    count(*) filter (where mode <> 'blob')
  into enabled_catch_all_count, non_blob_count
  from public.sync_v2_rollout_rules;

  select tables.relrowsecurity
  into rls_enabled
  from pg_catalog.pg_class tables
  join pg_catalog.pg_namespace schemas on schemas.oid = tables.relnamespace
  where schemas.nspname = 'public'
    and tables.relname = 'sync_v2_rollout_rules';

  if present_constraints <> cardinality(expected_constraints)
    or enabled_catch_all_count <> 1
    or non_blob_count <> 0
    or rls_enabled is distinct from true then
    raise exception 'Sync v2 rollout preflight postcondition failed';
  end if;
end;
$$;
