---
"@input/pen-core": patch
"@input/pen-dom": patch
---

Prevent the browser from stealing the caret on unbound navigation keys, and make Home land on the visual line start.

K1 now `preventDefault`s PageDown/PageUp and the other owned nav keys when no command is bound. Home/End are bound on macOS as well as Windows/Linux so `pen.caretLineStart/End` actually dispatch; those commands use an injected visual line-edge measure (logical block edges remain the headless fallback).
