---
"@input/pen-history": patch
"@input/pen-multiplayer": patch
"@input/pen-preset-default": patch
---

Export ESM as dist/index.mjs and pin published workspace dependencies with workspace:^ so co-released packages do not pack to exact-version duplicates.
