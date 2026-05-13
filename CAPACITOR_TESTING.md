# MyBishBash Mobile App Wrapper

This project now includes a Capacitor wrapper around the live MyBishBash web app:

- Live web app: `https://drlizlondon.github.io/mybishbash/`
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
