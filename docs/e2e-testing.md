# E2E Smoke Testing

Run the browser smoke tests against the built preview app:

```bash
npm run build
npm run test:e2e
```

To watch the browser:

```bash
npm run test:e2e:headed
```

For a full release gate:

```bash
npm run test:release
```

## What They Cover

- App load safety for login/onboarding/home entry states.
- Seeded authenticated Home without real Supabase credentials.
- In-app fake Safari, YouTube, and Instagram launchers attempting to open real destinations.
- `/intercept/safari` showing an interruption card without auto-opening the real app.
- Continue-to-app opening the destination through the captured navigation hook.
- Normal Home card opening separately from fake launcher behaviour.
- Launcher-origin card completion avoiding an immediate card loop.
- Basic create, open, and complete card flow.
- iPhone-size viewport bottom navigation and fake launcher destination behaviour.

## How State Is Seeded

The tests set localStorage before the app loads:

- `MYBISHBASH_E2E_MODE=true` enables a local test session.
- `MYBISHBASH_DEMO_MODE=true` disables Supabase-backed launcher event writes.
- `mybishbash.setup-complete.v1`, `mybishbash.profile.v1`, `mybishbash.cards.v1`, and related local keys provide deterministic local app state.

Destination launches are captured by `window.__MYBISHBASH_E2E_CAPTURE_NAVIGATION`, so tests can assert the attempted URL without leaving MyBishBash.

## What They Do Not Cover

- Real Supabase login, permissions, or row-level security.
- Real two-device cloud sync and merge timing.
- Real iOS/Android PWA install shell behaviour.
- Whether native URL schemes actually open installed apps on a physical device.
- Production data migrations or account entitlement edge cases.

## Why Manual Staging QA Still Matters

These are smoke tests, not a production twin. Before deploying for real users, still run the release checklist on a staging or preview URL with one existing test account, one brand-new test account, two browser/device sessions for sync, and at least one installed fake launcher route.
