---
"@input/pen-dom": patch
---

Declare the table-cell parity contract (FE6) in `CELL-PARITY.md`: which field-editor capabilities apply inside a cell, which decline, and — the part that needed writing down — which half-work. Eight capabilities declined inside a cell and every one of them declined silently, so a host could not tell "not supported here" from "broken".

Mark toggling now says so. A bold, italic, or underline toggle inside a cell emits a `cell-capability-unsupported` diagnostic with `capability: "marks"` instead of returning without a trace. The document is untouched either way; only the reporting changed.

`scenarios/fe6-cell-parity.spec.ts` covers this on Chromium, Firefox, and WebKit. Note for hosts wiring their own bold shortcut: only Chromium turns the platform accelerator into a `formatBold` `beforeinput` inside a `contenteditable`, so that is the only engine where the native route produces the diagnostic. `richTextShortcutsExtension()`'s `Mod-b` reaches every engine and still declines through `toggleInlineMark`'s `false` return without a diagnostic.
