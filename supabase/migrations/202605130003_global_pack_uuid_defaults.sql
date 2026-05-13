create extension if not exists pgcrypto;

alter table public.global_packs
  alter column id set default gen_random_uuid();

alter table public.global_pack_cards
  alter column id set default gen_random_uuid();
