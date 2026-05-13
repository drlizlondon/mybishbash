alter table public.global_pack_cards
  add column if not exists attribution text,
  add column if not exists frequency text not null default 'once_daily',
  add column if not exists timing_windows text[] not null default array['morning', 'day', 'evening'],
  add column if not exists position integer not null default 0,
  add column if not exists created_at timestamptz not null default now();

alter table public.global_packs
  add column if not exists description text,
  add column if not exists theme text not null default 'Minimal',
  add column if not exists published boolean not null default false,
  add column if not exists icon text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();
