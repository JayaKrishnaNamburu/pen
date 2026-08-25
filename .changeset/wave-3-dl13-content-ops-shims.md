---
"@input/pen-content-ops": minor
---

Delete the `@input/pen-content-ops` re-export shims of core (`blocks.ts`, `blockCapabilities.ts`, `profilePolicy.ts`, and the matching barrel passthroughs). Import `blocksToOps`, `PendingBlock`, profile-policy helpers, and block-capability helpers from `@input/pen-core`. This is breaking: those names were on the published `.` export.
