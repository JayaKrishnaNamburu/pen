---
"@input/pen-dom": patch
---

Let leftover-on-other-block selection reads go through `readDomSelection` instead of `shouldIgnoreDomTextSelection`.

Closed-window leftover after Enter-split diverges and requests P2; an open pointer window still accepts. The public `shouldIgnoreDomTextSelection` method is deleted from `FieldEditorDomController`.
