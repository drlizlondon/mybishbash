# GitHub Pages Branch Preview

This branch uses a separate GitHub Pages project for installed-PWA testing before merging to `main`.

Production stays at:

```text
https://drlizlondon.github.io/mybishbash/
```

The preview target is:

```text
https://drlizlondon.github.io/mybishbash-preview/
```

The Safari fake launcher install page is:

```text
https://drlizlondon.github.io/mybishbash-preview/install/safari/
```

## Why It Is Separate

GitHub Pages deploys one whole-site artifact per Pages site. A staging deployment to the same `mybishbash` Pages site could replace production, even if it only intended to publish a subpath.

For that reason, preview builds must deploy to a separate repository/site such as:

```text
drlizlondon/mybishbash-preview
```

That repository should publish the `gh-pages` branch from `/`.

## Preview Workflow Setup

In the main `drlizlondon/mybishbash` repository, configure:

```text
PAGES_PREVIEW_TOKEN
```

as a repository secret with permission to push to the preview repository.

Optional repository variables:

```text
PAGES_PREVIEW_REPOSITORY=drlizlondon/mybishbash-preview
PAGES_PREVIEW_ORIGIN=https://drlizlondon.github.io
PAGES_PREVIEW_BASE_PATH=/mybishbash-preview/
PAGES_PREVIEW_APP_NAME=MyBishBash Test
PAGES_PREVIEW_SHORT_NAME=BishBash Test
```

Run the manual workflow from the branch you want to test:

```text
Deploy GitHub Pages Preview
```

## iPhone Install Steps

1. Open Safari on iPhone.
2. Go to:

   ```text
   https://drlizlondon.github.io/mybishbash-preview/install/safari/
   ```

3. Tap Share.
4. Tap Add to Home Screen.
5. Confirm the app name says a test name, such as `Safari Test` or `MyBishBash Test`.
6. Launch the newly installed test icon.
7. Confirm it opens:

   ```text
   https://drlizlondon.github.io/mybishbash-preview/intercept/safari
   ```

8. Test the fake launcher sequence.

## Reinstalling After Changes

iOS can cache installed PWA metadata aggressively.

After a preview redeploy:

1. Delete the old test Home Screen icon.
2. Open the preview install page again in Safari.
3. Add to Home Screen again.
4. Reopen the newly installed icon.

## Production Difference

Production manifests remain unchanged:

```text
https://drlizlondon.github.io/mybishbash/home
https://drlizlondon.github.io/mybishbash/intercept/safari
```

Preview manifests are rewritten only inside the generated `dist` preview artifact:

```text
https://drlizlondon.github.io/mybishbash-preview/home
https://drlizlondon.github.io/mybishbash-preview/intercept/safari
```

The preview build does not change launcher selection logic or production deployment.
