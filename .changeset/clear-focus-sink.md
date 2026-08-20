---
"@input/pen-dom": patch
"@input/pen-react": patch
---

Keep AX1 editor-root textbox semantics from swallowing document keyboard routing.

`isNativeTextEntryTarget` no longer treats the editor root as a nested native control. Document shortcuts skip detached AX3 surfaces so Escape can close a toolbar and restore editor focus. Unknown clipboard block types do not direct-paste. The React root attaches document keydown once the root element is committed.
