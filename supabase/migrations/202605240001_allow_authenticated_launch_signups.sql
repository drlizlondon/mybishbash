grant insert on public.launch_signups to authenticated;

drop policy if exists "Allow authenticated launch signup inserts" on public.launch_signups;

create policy "Allow authenticated launch signup inserts"
on public.launch_signups
for insert
to authenticated
with check (
  email <> ''
  and country <> ''
  and phone_os <> ''
  and consent_launch_updates is true
);
