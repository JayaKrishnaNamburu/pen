---
"@input/pen-import-html": patch
---

Pin the sanitizer dependency graph to undici 7.29.0 and dompurify 3.4.14, and make the published-package audit blocking.

`@input/pen-import-html` reaches undici through `isomorphic-dompurify` → `jsdom`, and shipped 7.22.0 with five high-severity advisories — consumer-reachable through `@input/pen-react` and `@input/pen-vue`, both of which depend on import-html at runtime. Root `pnpm.overrides` moves the graph to the patched versions while staying inside SEC7's `~2.x` sanitizer pin.

The advisory was invisible because the supply-chain workflow ran `pnpm audit --prod` under `continue-on-error` with no expiry, so a real check reported green on every PR. The audit now classifies by install path and fails only on advisories reaching a published package; the remaining hits all start at `playground` or `examples/vue` and do not ship.
