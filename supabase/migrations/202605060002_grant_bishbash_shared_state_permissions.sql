grant usage on schema public to anon;

grant select, insert
  on public.profiles
  to anon;

grant select, insert, update
  on public.mybishbash_state
  to anon;
