---
"@input/pen-react": patch
---

Keep the editor caret solid under `prefers-reduced-motion` (AX6).

`EditorCaretOverlay` re-applied `--pen-editor-caret-animation` whenever the type-pause blink resumed, without consulting the reduced-motion signal. Hosts that leave the token unset were unaffected, but a host styling the caret to match a native platform got an animating caret under reduced motion. The overlay now subscribes to `createReducedMotionSignal` from `@input/pen-dom` and writes a solid caret while reduced motion is active.
