create index if not exists global_packs_published_updated_at_idx
  on public.global_packs (published, updated_at desc);

create index if not exists global_pack_cards_pack_position_idx
  on public.global_pack_cards (pack_id, position);

create index if not exists mybishbash_events_created_at_idx
  on public.mybishbash_events (created_at desc);

create index if not exists mybishbash_events_user_created_at_idx
  on public.mybishbash_events (user_id, created_at desc);

create index if not exists mybishbash_events_type_created_at_idx
  on public.mybishbash_events (event_type, created_at desc);

create index if not exists user_profiles_last_seen_at_idx
  on public.user_profiles (last_seen_at desc);
