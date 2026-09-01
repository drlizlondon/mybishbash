-- HQ Packs: true adoption metric from saved user selections, not telemetry.

create or replace function public.hq_pack_adoption_summary()
returns table (
  pack_id text,
  users_enabled bigint
)
language sql
security definer
set search_path = public
as $$
  select
    nullif(card.value ->> 'sourcePackId', '') as pack_id,
    count(distinct state.user_id)::bigint as users_enabled
  from public.mybishbash_state state
  cross join lateral jsonb_array_elements(coalesce(state.state_json -> 'cards', '[]'::jsonb)) as card(value)
  where state.user_id is not null
    and exists (
      select 1
      from public.admin_users admins
      where admins.user_id = auth.uid()
    )
    and nullif(card.value ->> 'sourcePackId', '') is not null
    and nullif(card.value ->> 'deletedAt', '') is null
  group by nullif(card.value ->> 'sourcePackId', '');
$$;

revoke all on function public.hq_pack_adoption_summary() from public;
grant execute on function public.hq_pack_adoption_summary() to authenticated;
