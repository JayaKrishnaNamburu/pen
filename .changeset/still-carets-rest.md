---
"@input/pen-dom": patch
---

Add `createReducedMotionSignal` so hosts can read `prefers-reduced-motion`.

The signal reads the media query once and exposes a live `reduced` flag. Overlay and paint code does not consume it yet (solid caret, static shimmer badge, and instant transitions are not shipped).
