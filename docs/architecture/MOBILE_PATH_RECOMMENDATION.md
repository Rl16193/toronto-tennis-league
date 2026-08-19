# Mobile path recommendation

## Evidence

The current product is a React/Vite web application with Firebase Web SDK integration, responsive styling, browser Storage uploads, map rendering, and browser Auth providers. No native iOS, Android, Capacitor, or React Native project exists in this checkout.

## Recommendation

Adopt a PWA-first path after environment and authorization stabilization. The existing web client is the lowest-risk way to validate mobile navigation, offline/read-only behavior, installability, and notification expectations without creating a second client authority path.

| Option | Fit now | Tradeoff |
| --- | --- | --- |
| PWA | Recommended first | Fastest reuse; limited native background/device APIs |
| Capacitor | Possible second step | Reuses web UI while adding native plugins; introduces bridge, signing, and two-runtime QA |
| Fully native | Not justified by current evidence | Best platform integration, but duplicates product surface and Firebase/state behavior |

## Guardrails before mobile work

- Stabilize server-authoritative scoring and role authorization.
- Add emulator/staging fixtures and rules/function tests.
- Define mobile-specific offline and sync semantics instead of assuming browser cache behavior.
- Verify Auth provider behavior, Storage uploads, deep links, notifications, and accessibility on physical devices before claiming mobile readiness.

## Open questions

- Which native capabilities are actually required beyond the responsive web experience?
- Are push notifications a product requirement or only email/in-app notifications?
- What offline actions, if any, may be queued safely?

Last verified source SHA: `8866f1b`.
