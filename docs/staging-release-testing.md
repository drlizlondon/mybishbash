# Staging Release Testing

The staging release suite runs browser checks against a real preview or staging URL with real Supabase-backed test accounts. It is separate from the local mocked E2E suite.

## Required Environment Variables

```bash
export MYBISHBASH_STAGING_URL="https://your-preview-url.example/mybishbash"
export MYBISHBASH_EXISTING_TEST_EMAIL="existing-test@example.com"
export MYBISHBASH_EXISTING_TEST_PASSWORD="existing-test-password"
export MYBISHBASH_NEW_TEST_EMAIL="new-test-unique@example.com"
export MYBISHBASH_NEW_TEST_PASSWORD="new-test-password"
export MYBISHBASH_NEW_TEST_ACCESS_CODE="ACCESS-CODE"
```

The suite refuses to run against known production URLs unless this is also set:

```bash
export MYBISHBASH_ALLOW_PRODUCTION_STAGING_TESTS=true
```

Use that only when intentionally testing production.

## Safe Test Accounts

- Keep one existing test account that already has access and can log in repeatedly.
- Use a brand-new email address for the signup test when possible.
- If the brand-new account already exists, the test falls back to login with the supplied new-account credentials.
- Do not use real user accounts or personal passwords.
- Use an access code intended for QA, not a customer invite.

## Commands

Run only the staging suite:

```bash
npm run test:staging-release
```

Run local release checks first, then staging:

```bash
npm run test:release:staging
```

The normal local release gate remains:

```bash
npm run test:release
```

## Automated Coverage

- Existing account login reaches a safe Home/app state.
- Brand-new account signup or fallback login reaches a safe state.
- Device A creates, edits, and deletes a unique QA card.
- Device B polls and confirms create/edit/delete sync convergence.
- `/home` fake Safari, YouTube, and Instagram launchers attempt real destinations and do not create MyBishBash cards.
- `/intercept/safari` reaches an interruption, continue-to-app, or safe caught-up intercept state without auto-opening Safari.
- Continue-to-app opens a destination only after user action.
- Return-from-real-app simulation settles into Home or one safe overlay instead of a card loop.
- Mobile Safari approximation uses an iPhone browser profile for app load, bottom nav, `/intercept/safari`, and fake launcher destination behaviour.
- Console errors and uncaught page exceptions fail tests.

## What Still Needs Human Confirmation

- A real installed iOS PWA launched from the Home Screen.
- Native URL schemes opening real installed apps on physical devices.
- OS-level return-from-app lifecycle behaviour on a physical iPhone.
- Real email confirmation flows if Supabase requires email verification.
- Production-only data, entitlement, DNS, CDN, or browser cache edge cases.

## Interpreting Failures

- Missing env vars: export all required variables and rerun.
- Production URL refusal: use a staging/preview URL or explicitly set `MYBISHBASH_ALLOW_PRODUCTION_STAGING_TESTS=true`.
- Login/signup failure: confirm test credentials, access code, and Supabase auth settings.
- Sync convergence failure: inspect the unique QA card name printed in the report, then check Supabase shared state and both browser sessions.
- Fake launcher failure: confirm Safari, YouTube, and Instagram fake launchers are enabled for the existing test account.
- Destination failure: confirm the app still routes destination opens through the captured destination hook or attempts navigation after user action.

At the end of the suite, Playwright prints a release readiness report with the staging URL, unique QA card names, and pass entries for completed checks.
