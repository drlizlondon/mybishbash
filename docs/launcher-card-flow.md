# Launcher Card Flow

`launchSession` is the source of truth for launcher card UI decisions. It is normalised by `normalizeLaunchSession` in `src/App.jsx` and carries:

- `entrySurface`: `fake_launcher`, `mybishbash_home`, or `unknown`
- `launcherId`: the originating fake launcher id, or `null`
- `allowBackHome`: whether card UI may offer a home/back-home affordance
- `allowedDestinationIds`: the launcher chips that may be shown
- `primaryAction`: `continue_to_app` or `back_to_home`

`/intercept/:launcherId` always creates a `fake_launcher` session. Fake launcher sessions never allow Back to home and always expose exactly one destination chip: the originating launcher. MyBishBash home sessions may allow Back to home and may expose multiple launcher chips. The renderer must not re-derive launch origin from route, display mode, installed shell state, or the current page.

All card CTA copy must go through `getLauncherCardActions`. Pack cards use `I really like this one` for the secondary action. The primary action is resolved from `launchSession.primaryAction`, so fake launcher cards show `Continue` while genuine MyBishBash home card browsing can still show `Back to home` where expected.

Destination chips must go through `getVisibleDestinationChips`. The safest fallback for an unknown session is no Back to home and no launcher chips.

Terminal, caught-up, empty, and action-card overlays must also consume the normalised launch session. In fake launcher sessions they must not render `Back to home`, `Back home`, `Back to MyBishBash`, or the `Go home` icon. If a fake launcher journey needs to finish, the terminal action is continue-to-app for the preserved `launcherId`.

Legacy Like/Dislike naming is compatibility-only:

- Still needed for compatibility: `mybishbash.disliked-pack-card-ids.v1`, `card.disliked`, `pack_card_liked`, `pack_card_disliked`, and `intercept_card_disliked`.
- Internal historical data only: HQ/event labels that render historical `pack_card_liked` or hidden-card events.
- Visible UI copy: pack-card UI must never render `Like` or `Dislike`; use `I really like this one` and the central primary action label.
- Dead UI path: direct pack-card `Like`/`Dislike` action construction has been removed from `Overlay`.
