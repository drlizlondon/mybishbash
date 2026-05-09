-- 1. Add user_id to bishbash_state 
-- (Nullable for now so it doesn't break existing sync_code profiles)
alter table public.bishbash_state
add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- 2. Create the bishbash_events table (used by eventLog.js)
create table if not exists public.bishbash_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  created_at timestamptz not null default now(),
  source_type text,
  bash_id text,
  bash_title text,
  card_id text,
  card_title text,
  card_text text,
  card_source text,
  app_id text,
  app_name text,
  launcher_context text,
  target_app text,
  pack_id text,
  message_id text,
  action_taken text,
  metadata jsonb
);

alter table public.bishbash_events enable row level security;

-- 3. Add secure RLS policies for authenticated users on bishbash_state 
-- (Leaving anon policies intact so the current app continues to work)
drop policy if exists "state can be created by authenticated user" on public.bishbash_state;
create policy "state can be created by authenticated user"
  on public.bishbash_state for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "state can be read by authenticated user" on public.bishbash_state;
create policy "state can be read by authenticated user"
  on public.bishbash_state for select to authenticated using (auth.uid() = user_id);

drop policy if exists "state can be updated by authenticated user" on public.bishbash_state;
create policy "state can be updated by authenticated user"
  on public.bishbash_state for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4. Add secure RLS policies for events
drop policy if exists "events can be inserted by authenticated user" on public.bishbash_events;
create policy "events can be inserted by authenticated user"
  on public.bishbash_events for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "events can be read by authenticated user" on public.bishbash_events;
create policy "events can be read by authenticated user"
  on public.bishbash_events for select to authenticated using (auth.uid() = user_id);