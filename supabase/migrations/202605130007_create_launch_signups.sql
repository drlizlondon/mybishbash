create table if not exists public.launch_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  country text not null,
  phone_os text not null,
  age_range text,
  main_distraction_app text,
  wants_beta_testing boolean default false,
  consent_launch_updates boolean not null,
  created_at timestamptz default now()
);

alter table public.launch_signups enable row level security;

grant insert on public.launch_signups to anon;

drop policy if exists "Allow anonymous launch signup inserts" on public.launch_signups;

create policy "Allow anonymous launch signup inserts"
on public.launch_signups
for insert
to anon
with check (
  email <> ''
  and country <> ''
  and phone_os <> ''
  and consent_launch_updates is true
);
