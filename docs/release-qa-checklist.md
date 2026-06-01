# Release QA Checklist

Before pushing or deploying changes, run every automated check and complete the staging manual QA pass. If any command or manual check fails, the release must not proceed.

## Automated Release Checks

- [ ] `npm run build`
- [ ] `npm run test:launcher-flow`
- [ ] `npm run test:launchers`
- [ ] `npm run test:testpilot`
- [ ] `npm run test:fake-launchers`
- [ ] `npm run test:release-guardrails`
- [ ] `npm run test:e2e`

Recommended combined command:

```bash
npm test
```

Full release command including browser smoke tests:

```bash
npm run test:release
```

Staging release command, with real staging URL and QA account env vars:

```bash
npm run test:release:staging
```

## Staging Setup

Before deploying to production, test on a staging or preview URL using:

- [ ] One existing test account.
- [ ] One brand-new test account.
- [ ] Two browser or device sessions to confirm sync.
- [ ] At least one installed fake launcher route.

## Required Staging Manual QA

- [ ] Existing account login
- [ ] Brand-new account signup/login
- [ ] Device A create/edit/delete card
- [ ] Device B confirms sync
- [ ] `/home` fake Safari opens destination
- [ ] `/home` fake YouTube opens destination
- [ ] `/home` fake Instagram opens destination
- [ ] `/intercept/safari` still interrupts
- [ ] Continue-to-app opens destination
- [ ] Return from real app does not loop
- [ ] Mobile Safari installed/PWA check

## 1. Login

- [ ] Existing user can log in.
- [ ] Invalid login shows a safe error.
- [ ] Logged-in user reaches Home.
- [ ] Logout works.

## 2. Sync

- [ ] Local changes are saved.
- [ ] Cloud sync status appears correctly.
- [ ] Changes made on Device A appear on Device B after login or refresh.
- [ ] Offline changes queue and later sync.
- [ ] No duplicate cards after sync.
- [ ] Deleted cards do not reappear.

## 3. Fake Launchers

- [ ] In-app fake launchers open the real destination app or website.
- [ ] In-app fake launchers do not trigger a new MyBishBash card.
- [ ] `/intercept/:launcherId` still triggers the interruption flow.
- [ ] Continue-to-app still opens the real destination.

## 4. Interruption Flow

- [ ] Installed fake launcher route opens an interruption card when available.
- [ ] User can choose "continue to app".
- [ ] User can choose "do something else".
- [ ] Completing an interruption card does not create a loop.
- [ ] No-card state behaves correctly.

## 5. Non-Interruption Flow

- [ ] Normal Home opens without auto-triggering launcher cards.
- [ ] Personal cards open from Home.
- [ ] Pack cards open from Home.
- [ ] No-cards state is shown safely.

## 6. Cards

- [ ] Create card.
- [ ] Edit card.
- [ ] Complete card.
- [ ] Pause and unpause card.
- [ ] Delete card.
- [ ] Card does not reappear incorrectly.

## 7. Packs

- [ ] Activate pack.
- [ ] Deactivate pack.
- [ ] Pack appears on Home when active.
- [ ] Pack cards do not break personal card flow.

## 8. Settings

- [ ] Settings page opens.
- [ ] Launcher settings save.
- [ ] Notification settings do not crash.
- [ ] Fake launcher preview does not accidentally start an interruption flow.

## 9. Logging

- [ ] Key events are recorded without blocking the UI.
- [ ] Launcher open events are logged.
- [ ] Continue-to-app events are logged.
- [ ] Failed logging does not break app usage.

## 10. Mobile/PWA Behaviour

- [ ] App loads on mobile viewport.
- [ ] Bottom nav works.
- [ ] Installed launcher route works.
- [ ] Returning from real app does not trigger unwanted card loops.
