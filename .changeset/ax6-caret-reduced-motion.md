---
"@input/pen-dom": patch
"@input/pen-react": patch
---

Honor prefers-reduced-motion on the React caret overlay via the central AX6 signal.

Hosts that set `--pen-editor-caret-animation` (native-app caret parity) were blinking regardless of the OS reduced-motion preference. `EditorCaretOverlay` now reads `createReducedMotionSignal` and paints a solid caret when `reduced` is true. `createReducedMotionSignal` is exported from `@input/pen-dom` so published consumers can reach it.
