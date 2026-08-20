---
"@input/pen-dom": patch
"@input/pen-react": patch
"@input/pen-undo": patch
---

Route terminal clipboard write failures and thrown undo stack listeners through the diagnostic channel.

Silent `.catch(() => {})` copy fallbacks and `/* ignore */` undo listener isolation hid permission and subscriber errors. Remaining parse and DOM catches keep a justification comment instead of a diagnostic.
