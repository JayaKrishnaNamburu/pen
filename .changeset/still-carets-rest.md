---
"@input/pen-dom": patch
---

Add a central reduced-motion signal so overlay and paint code can respect the user's motion preference.

`createReducedMotionSignal` reads `prefers-reduced-motion` once and exposes a live `reduced` flag. Overlay adoption (solid caret, static shimmer badge, instant transitions) is deferred.
