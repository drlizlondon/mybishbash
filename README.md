# MyBishBash

## Tester Mode

Tester Mode is powered by the reusable `src/testing/TestPilot` module. Signed-in users only see the floating bug button when `user_profiles.is_tester` is `true`. Non-testers and anonymous visitors do not see tester tools.

Apply the Supabase migration:

```bash
supabase db push
```

The migration adds tester fields to `user_profiles`, tester grants to `mybishbash_access_codes`, the `tester_reports` and `tester_report_attachments` tables, and the `tester-report-uploads` Storage bucket policies.

To grant tester access by access code, set:

```sql
update public.mybishbash_access_codes
set grants_tester = true, tester_group = 'pilot-a'
where code = 'YOURCODE';
```

When that code is claimed, the user profile is marked as a tester and gets the code's tester group.

Admins can manually manage tester access in `HQ -> User Timelines` using the Tester Mode controls on each user card, or directly in Supabase by updating `user_profiles.is_tester`, `tester_group`, and `tester_notes`.

Tester reports live in `HQ -> Tester Reports`, where admins can filter by status, severity, launcher, report type, device, or search text. Admins can inspect screenshots and diagnostics, update status, and add internal notes.

Diagnostics intentionally avoid private data. TestPilot records route, display mode, launcher context, device/browser summary, viewport, setup state, selected launcher, recent event counts/types, and a presence-only summary of safe `mybishbash.*` localStorage keys. It does not upload Supabase auth tokens, sessions, passwords, full localStorage dumps, or private card text.
