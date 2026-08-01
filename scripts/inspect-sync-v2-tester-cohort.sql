-- Privacy-minimised Phase 6 tester-cohort structure check.
-- Run against shared Supabase project ifcgomivmzwqqxhltfjj.
-- Group values, hashes, emails, and user ids are never returned. Opaque labels
-- distinguish non-null groups only within this result. General automation,
-- consent, contactability, and real-participant status require human evidence.

with candidates as (
  select
    summary.user_id,
    nullif(btrim(summary.tester_group), '') as tester_group,
    summary.last_meaningful_activity_at >= now() - interval '30 days' as active_30d,
    admins.user_id is not null as operator_account,
    lower(coalesce(summary.cohort, '')) = 'e2e'
      or lower(coalesce(summary.access_source, '')) like '%e2e%' as e2e_marked
  from public.user_summary summary
  left join public.admin_users admins on admins.user_id = summary.user_id
  where summary.is_tester = true
), grouped as (
  select
    tester_group,
    count(*) as tester_rows,
    count(*) filter (where active_30d) as active_30d_rows,
    count(*) filter (where operator_account) as operator_account_excluded,
    count(*) filter (where e2e_marked) as e2e_marked_excluded,
    count(*) filter (
      where active_30d
        and not operator_account
        and not e2e_marked
    ) as structurally_eligible_before_human_attestation
  from candidates
  where tester_group is not null
  group by tester_group
), labelled as (
  select
    format(
      'group_%s',
      lpad(row_number() over (order by digest(tester_group, 'sha256'))::text, 2, '0')
    ) as group_label,
    tester_rows,
    active_30d_rows,
    operator_account_excluded,
    e2e_marked_excluded,
    structurally_eligible_before_human_attestation
  from grouped
)
select * from labelled
union all
select
  'unassigned' as group_label,
  count(*) as tester_rows,
  count(*) filter (where active_30d) as active_30d_rows,
  count(*) filter (where operator_account) as operator_account_excluded,
  count(*) filter (where e2e_marked) as e2e_marked_excluded,
  0::bigint as structurally_eligible_before_human_attestation
from candidates
where tester_group is null
having count(*) > 0
order by group_label;
