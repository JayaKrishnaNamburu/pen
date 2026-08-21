---
---

The nine F39 React jsdom cases were quarantined because jsdom cannot represent real selection, IME, or geometry. Clearing the allowlist by deleting those tests left the suite green with no replacement coverage.

Each behavior now lives in `@input/pen-conformance` as a Chromium Playwright scenario: backspace exit from empty blockquote and bullet list, `3. ` and `[ ] ` input-rule conversions, undo/redo selection and caret movement, the HOST6 collapsed-only caret overlay, remote edits during IME composition, and history reconciliation of a passive block while editing is expanded.
