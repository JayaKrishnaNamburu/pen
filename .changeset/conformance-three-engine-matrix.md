---
"@input/pen-dom": patch
---

Fix the four browser-verified defects that the conformance scenarios had been reporting: `beforeinput` events now resolve through `BEFOREINPUT_MAP` (the map was complete but the handler never consulted it, so three inputTypes never called `preventDefault` and unknown types were absorbed silently), caret-rect cache invalidation no longer leaves stale geometry in following blocks, vertical caret motion no longer leaks the empty-block sentinel as offset 1, and bidi line boxes now carry real per-run rects instead of a single-run placeholder.

These four scenarios live in the conformance harness and are asserted on Chromium, WebKit, and Firefox.
