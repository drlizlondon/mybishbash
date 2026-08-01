-- Forward rollback for 202608010001_sync_v2_rollout_control.sql.
--
-- This project is shared by production and staging. Run section 1 first for
-- any rollout-control incident: it atomically restores the only safe preflight
-- posture without relying on application code. Section 2 removes the preflight
-- surface entirely and is appropriate only while no application consumer has
-- landed (that is, before Phase 6 Commit 1).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. EMERGENCY SAFE POSTURE: one enabled catch-all blob rule, nothing else.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
  next_generation bigint;
begin
  lock table public.sync_v2_rollout_rules in share row exclusive mode;

  select coalesce(max(existing.generation), 0) + 1
  into next_generation
  from public.sync_v2_rollout_rules existing;

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
end;
$$;

do $$
begin
  if (select count(*) from public.sync_v2_rollout_rules) <> 1
    or (select count(*) from public.sync_v2_rollout_rules
        where enabled and audience_kind = 'all' and mode = 'blob') <> 1 then
    raise exception 'Sync v2 rollout safe-posture rollback failed';
  end if;
end;
$$;

commit;

-- Verify before doing anything else:
-- select priority, audience_kind, audience_label, mode, generation, enabled
-- from public.sync_v2_rollout_rules order by priority;
-- Expected: exactly one enabled row, catch-all-blob, mode=blob.

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. COMPLETE REMOVAL (pre-Commit-1 only; intentionally manual).
-- ═══════════════════════════════════════════════════════════════════════════

-- begin;
-- drop function if exists public.hq_reset_sync_v2_rollout_rules();
-- drop function if exists public.hq_set_sync_v2_rollout_rule(
--   integer, text, text, text, text, integer, integer, boolean
-- );
-- drop function if exists public.get_sync_v2_assignment(integer, integer);
-- drop table if exists public.sync_v2_rollout_rules;
-- commit;

-- access_audit_log rows are intentionally preserved as immutable operator
-- evidence. No user profile, shared-state, event, or entitlement data is
-- changed by either section.
