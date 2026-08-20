---
"@input/pen-react": patch
---

Remove the inert `virtualize` prop from `EditorContent` and `PenEditor`.

Windowing is a host concern (SCALE5). The replacement contract is in `packages/rendering/react/VIRTUALIZATION.md`.
