---
"@input/pen-content-ops": patch
---

Remove unused public exports from the shared content-ops package.

`TARGET_EDITABILITIES`, `STRUCTURED_TARGET_KINDS`, and `normalizePlanProps` had no caller and no test. The remaining surface is the live shared library at `packages/shared/content-ops`, not the deleted extensions husk.
