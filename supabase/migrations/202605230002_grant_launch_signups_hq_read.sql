grant select on public.launch_signups to authenticated;

drop policy if exists "admins can read launch signups" on public.launch_signups;
create policy "admins can read launch signups"
on public.launch_signups
for select
to authenticated
using (exists (
  select 1
  from public.admin_users admins
  where admins.user_id = auth.uid()
));
