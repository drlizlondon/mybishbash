# MyBishBash Mobile App Wrapper

This project includes a Capacitor wrapper around the live MyBishBash web app:

- Live web app configured in `capacitor.config.json`: `https://mybishbash.app/`
- App name: `MyBishBash`
- App ID: `com.drlizlondon.mybishbash`

## What this does

The native app shell loads the existing hosted MyBishBash site. That means:

- the GitHub Pages version keeps working
- the native app always shows the live MyBishBash app
- you do not need to rebuild the web app just to see content updates

## One-time setup

From the project folder:

```bash
npm install
npx cap sync
```

## Open in Xcode

From the project folder:

```bash
npm run cap:open:ios
```

That opens the iOS project in Xcode.

## Test on iPhone

1. Connect your iPhone to your Mac with a cable.
2. Open the iPhone and tap `Trust This Computer` if prompted.
3. In Xcode, open the project if it is not already open.
4. In the top toolbar, choose the `App` target.
5. Select your connected iPhone as the run device.
6. Open:
   `Signing & Capabilities`
7. Choose your Apple ID / Team.
8. If Xcode asks to fix signing issues, allow it.
9. Press the Run button in Xcode.

Xcode will install MyBishBash onto your iPhone.

## Test in the iPhone simulator

You can also use the iPhone Simulator in Xcode:

1. Open the iOS project.
2. Choose any iPhone simulator from the device list.
3. Press Run.

## Re-sync after config or native changes

If you update Capacitor config or plugins later, run:

```bash
npx cap sync
```

`npx cap sync` verifies that the native wrapper and plugins can be
synchronised. It does **not** prove that stored data survives a bundled
web-asset upgrade while `server.url` points at the live site: the wrapper loads
the remote origin instead of the copied `webDir` assets.

## Seeded-data upgrade proof

When an architecture or release gate requires native IndexedDB upgrade
evidence, use disposable worktrees/wrappers; do not alter the normal live-site
configuration in the protected checkout.

1. Prepare the legacy build and candidate build from their exact recorded SHAs
   in separate disposable clones or worktrees. If an archive without `.git` is
   unavoidable, set and verify `VITE_SOURCE_SHA` explicitly; never accept its
   otherwise-empty `version.json.sourceSha`.
2. In **both disposable copies**, keep the same `appId` and `webDir`, but remove
   the complete `server` object (including `server.url`) from
   `capacitor.config.json` before syncing. This makes both builds load packaged
   assets from the same `capacitor://localhost` origin. Merely leaving both
   wrappers pointed at the same live URL does not exercise a native web-asset
   upgrade.
3. Run `npm run build` with explicit `VITE_SOURCE_SHA` and
   `VITE_APP_VERSION` labels, verify both fields in `dist/version.json`, then
   run `npx cap sync ios` in the legacy copy. Install it, query the packaged
   `/version.json` through Web Inspector, create unique synthetic profile,
   card, and event data, then fully terminate and relaunch it to prove the seed
   is durable.
4. Run the same build/sync sequence in the candidate copy. Install it over the
   existing app on the same simulator/device. Do not uninstall, reset the
   simulator, clear Website Data, change the bundle ID, or change the origin.
5. Verify the candidate's packaged `/version.json`, every seeded value, and the
   IndexedDB migration metadata through the UI and Safari Web Inspector. Make
   a newer candidate edit and deterministic event while the retained
   localStorage bytes remain stale, fully terminate, and relaunch twice. The
   newer IndexedDB values must remain authoritative and the stale localStorage
   values must never render or overwrite them.
6. Record old/new SHAs, the disposable config diff, exact origin and bundle ID,
   build and sync results, device/simulator, iOS/Xcode/macOS versions, UTC
   timestamps, expected/actual results, storage checksums, console logs, and
   privacy-safe screenshots.

The current resumable Phase 5 procedure, fixed baseline/candidate, evidence
fields, pass/fail criteria, and failure-preservation steps are in
`docs/release-evidence/phase-05/manual-verification-packet-2026-08-02.md`.

A generic simulator launch or successful sync is not a substitute for this
install-over-upgrade sequence.

## iOS notes

- The app is portrait-first.
- The wrapper loads the public MyBishBash site.
- External links should leave the app and open in the system browser.

## Android

Android support is also included.

To open Android Studio:

```bash
npm run cap:open:android
```

## Important

The web app still lives here:

`https://drlizlondon.github.io/mybishbash/`

The Capacitor wrapper does not replace or break the GitHub Pages version.
