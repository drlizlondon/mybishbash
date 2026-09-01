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

`npx cap sync` verifies that the optional native wrapper and plugins can be
synchronised. It does not establish that the wrapper is distributed through an
App Store, TestFlight, or another production release channel.

## Architecture and acceptance boundary

MyBishBash is currently deployed as a web PWA. The checked-in Capacitor wrapper
is a thin optional shell whose `server.url` loads `https://mybishbash.app/`;
website revisions therefore arrive through the web deployment and service
worker path, not by replacing packaged native web assets.

An earlier Phase 5 procedure removed `server.url` in disposable copies and
installed two manufactured `capacitor://localhost` builds over one another.
That was technically valid for a packaged-native application, but it did not
represent this repository's deployed configuration and was superseded on
2026-08-03. The historical reasoning remains recorded in the Phase 5 manual
packet; it is not an operative release gate.

The live-URL Capacitor shell may still receive ordinary smoke testing without
changing its configuration. Packaged-native install-over-upgrade testing
becomes mandatory only if packaged web assets are explicitly adopted as a
supported release target with a documented distribution path. Do not remove
`server.url` merely to satisfy the current web-PWA acceptance criteria.

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
