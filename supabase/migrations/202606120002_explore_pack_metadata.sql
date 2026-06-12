-- Explore pack metadata (see docs/explore-architecture.md).
--
-- Adds the HQ-authored presentation and gating fields that turn global packs
-- into Explore cover cards: goal grouping, cover image, why-this-exists line,
-- featured/premium/experimental flags, content type (cards vs commitment
-- templates), source label and ordering. Cards gain a preview marker (the
-- "a taste" cards shown pre-install) and optional commitment defaults.
--
-- Additive only: existing clients select("*") and ignore unknown columns.

alter table public.global_packs
  add column if not exists goal text,
  add column if not exists cover_image_url text,
  add column if not exists why_text text,
  add column if not exists is_premium boolean not null default false,
  add column if not exists is_featured boolean not null default false,
  add column if not exists is_experimental boolean not null default false,
  add column if not exists content_type text not null default 'cards',
  add column if not exists source_label text not null default 'MyBishBash',
  add column if not exists published_at timestamptz,
  add column if not exists sort_order integer not null default 0;

alter table public.global_packs
  drop constraint if exists global_packs_content_type_check;
alter table public.global_packs
  add constraint global_packs_content_type_check
  check (content_type in ('cards', 'commitments', 'do_instead'));

-- Packs published before this migration get a stable published_at so the
-- "newest first" ordering inside goal sections works from day one.
update public.global_packs
set published_at = coalesce(published_at, updated_at)
where published = true;

alter table public.global_pack_cards
  add column if not exists is_preview boolean not null default false,
  add column if not exists commitment_defaults jsonb;

-- Public storage bucket for pack cover images. Mirrors the launcher-icons
-- bucket: public read (covers render for signed-out install pages too),
-- admin-only writes.
insert into storage.buckets (id, name, public)
values ('pack-covers', 'pack-covers', true)
on conflict (id) do nothing;

drop policy if exists "public can read pack covers" on storage.objects;
create policy "public can read pack covers"
  on storage.objects for select
  using (bucket_id = 'pack-covers');

drop policy if exists "admins can upload pack covers" on storage.objects;
create policy "admins can upload pack covers"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'pack-covers'
    and exists (
      select 1 from public.admin_users admins where admins.user_id = auth.uid()
    )
  );

drop policy if exists "admins can update pack covers" on storage.objects;
create policy "admins can update pack covers"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'pack-covers'
    and exists (
      select 1 from public.admin_users admins where admins.user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'pack-covers'
    and exists (
      select 1 from public.admin_users admins where admins.user_id = auth.uid()
    )
  );

drop policy if exists "admins can delete pack covers" on storage.objects;
create policy "admins can delete pack covers"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'pack-covers'
    and exists (
      select 1 from public.admin_users admins where admins.user_id = auth.uid()
    )
  );
