# Release Workflow

MyBishBash has real users, so production changes should move through a stable release path.

## Branches

```text
feature/*  -> staging -> main
```

`main` is production. Pushes to `main` deploy the public site, which is served by
**Cloudflare Pages**:

```text
https://mybishbash.app
```

Verified 2026-09-04 (MBB-6): `gh api repos/drlizlondon/mybishbash/pages` reports
`"cname": null`, so GitHub Pages does not serve `mybishbash.app` at all; live
responses carry only Cloudflare headers (no `server: GitHub.com`,
`x-github-request-id` or `via: varnish`); and the two platforms publish
*different* builds of the same commit (live and GitHub Pages `version.json`
share `sourceSha` but differ in `builtAt` and in the hashed main bundle).
Cloudflare Pages builds from `main` through its own Git integration — there is
no workflow for it in this repo.

A push to `main` also runs `.github/workflows/deploy-pages.yml`, which publishes
the GitHub Pages project site:

```text
https://drlizlondon.github.io/mybishbash/
```

That site is a secondary artefact, not the public product. It is built with
base `/`, so its asset links do not resolve under the `/mybishbash/` subpath.
Do not treat it as production.

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
- Production manifest still points at `https://mybishbash.app/` (asserted by
  `scripts/validate-cloudflare-production-build.mjs`; the `/mybishbash/` base
  belongs to the GitHub Pages preview, not production).
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
