drop policy if exists "users can insert own launcher events" on public.launcher_events;
create policy "users can insert own launcher events"
  on public.launcher_events for insert to authenticated
  with check (
    auth.uid() = user_id
    or (user_id is null and anonymous_device_id is not null)
  );
