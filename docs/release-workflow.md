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

`staging` is pre-production. Cloudflare Pages builds every branch it sees, so
pushes to `staging` publish the staging preview at:

```text
https://staging.mybishbashlive.pages.dev/
```

Every PR branch gets its own preview too (the "Cloudflare Pages" check on the PR
links it, e.g. `https://<branch>.mybishbashlive.pages.dev/`).

Limit: the Cloudflare build is the production build, so its web manifest pins
`id`, `start_url` and `scope` to `https://mybishbash.app/`. Branch previews are
right for page, route, copy and metadata checks, but **not** for installed-PWA
tests: Add to Home Screen from a preview does not give you a staging app. The
old GitHub Pages preview (`drlizlondon.github.io/mybishbash-preview/`) that
served installed-PWA tests was retired on 2026-10-13: its deploy had failed on
every run since 2026-09-26 (the token for the preview repository expired), so
that site only serves a stale build. There is no staging PWA until branch
previews get an origin-relative manifest (open follow-up).

`feature/*` branches are for individual experiments and fixes. They should not deploy to production.

## Release Path

1. Create a feature branch from `main` or current `staging`.
2. Make the focused change.
3. Run local checks.
4. Merge or fast-forward the feature into `staging`.
5. Let the Cloudflare staging preview deploy and check it (pages, routes, copy).
6. Test on real iPhone Safari and installed PWA.
7. Open a PR from `staging` to `main`.
8. Merge to `main` only after the checklist passes.

## Before Merging Staging To Main

- `npm run build` passes.
- `npm run test:before-push` passes.
- GitHub Actions checks are green.
- iPhone Safari can open the staging preview's install page.
- (Installed-PWA checks: see the limit above; there is no staging PWA today.)
- Fake Safari launcher shows the expected card flow.
- Interruption ON works.
- Continue opens the intended destination.
- Home button exits cleanly from cards/interruption/action cards.
- Relaunch after Home does not show stale card state.
- Production deploy workflow still triggers only from `main`.
- Production manifest still points at `https://mybishbash.app/` (asserted by
  `scripts/validate-cloudflare-production-build.mjs`; the `/mybishbash/` base
  belongs to the GitHub Pages project site, not production).

## Preview Install URL

Retired 2026-10-13 with the GitHub Pages preview (see the limit under
Branches). The old URL, `https://drlizlondon.github.io/mybishbash-preview/install/safari/`,
serves a stale build and must not be used for release evidence.

For ordinary manifest/install testing, delete and reinstall the test PWA after
a staging redeploy because iOS may cache Home Screen manifest metadata. Do
**not** reinstall during the Phase 5 update-and-persistence acceptance run: that
test deliberately keeps one installed Home Screen app and one origin/data
container across the baseline and candidate deployment.
