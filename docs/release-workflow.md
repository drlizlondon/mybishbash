# Release Workflow

MyBishBash has real users, so production changes should move through a stable release path.

## Branches

```text
feature/*  -> staging -> main
```

`main` is production. Pushes to `main` deploy the public GitHub Pages site:

```text
https://drlizlondon.github.io/mybishbash/
```

`staging` is pre-production. Pushes to `staging` deploy the separate preview site:

```text
https://drlizlondon.github.io/mybishbash-preview/
```

`feature/*` branches are for individual experiments and fixes. They should not deploy to production.

## Release Path

1. Create a feature branch from `main` or current `staging`.
2. Make the focused change.
3. Run local checks.
4. Merge or fast-forward the feature into `staging`.
5. Let the staging preview deploy.
6. Test on real iPhone Safari and installed PWA.
7. Open a PR from `staging` to `main`.
8. Merge to `main` only after the checklist passes.

## Before Merging Staging To Main

- `npm run build` passes.
- `npm run test:before-push` passes.
- GitHub Actions checks are green.
- iPhone Safari can open the staging install page.
- Add to Home Screen installs the staging/test PWA.
- Installed fake Safari launcher opens the staging preview path.
- Fake Safari launcher shows the expected card flow.
- Interruption ON works.
- Continue opens the intended destination.
- Home button exits cleanly from cards/interruption/action cards.
- Relaunch after Home does not show stale card state.
- Production deploy workflow still triggers only from `main`.
- Production manifest still points to `/mybishbash/`.
- Staging manifest points to `/mybishbash-preview/`.

## Preview Install URL

Use this for real iPhone staging tests:

```text
https://drlizlondon.github.io/mybishbash-preview/install/safari/
```

For ordinary manifest/install testing, delete and reinstall the test PWA after
a staging redeploy because iOS may cache Home Screen manifest metadata. Do
**not** reinstall during the Phase 5 update-and-persistence acceptance run: that
test deliberately keeps one installed Home Screen app and one origin/data
container across the baseline and candidate deployment.
