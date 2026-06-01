# Launcher QA Checklist

## Automated Checks

Run the full launcher regression suite before shipping launcher changes:

```bash
npm run build
npm run test:launcher-flow
npm run test:launchers
npm run test:testpilot
npm run test:fake-launchers
```

Or run the combined command:

```bash
npm test
```

## Manual Checks

- `/home` fake Safari opens real Safari destination, not a card.
- `/home` fake YouTube opens real YouTube destination, not a card.
- `/home` fake Instagram opens real Instagram destination, not a card.
- `/settings` launcher preview does not trigger a card.
- Overlay launcher icons do not trigger a card.
- `/intercept/safari` still triggers interception.
- `/intercept/youtube` still triggers interception.
- Continue-to-app still opens the destination.
- Completing a card does not create a loop back into another fake launcher card.
