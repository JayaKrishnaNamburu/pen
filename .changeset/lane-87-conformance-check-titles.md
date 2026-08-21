---
---

Stop conformance standing assertions from printing their failure sentence when they pass.

Playwright uses the `expect()` title for passing and failing checks alike. The DOM-authority fallback was the failure mode, so unrelated red scenarios all read as a selection-authority bug. Titles are now built from the known outcome (`passed:` / `skipped:` / `failed:`).
