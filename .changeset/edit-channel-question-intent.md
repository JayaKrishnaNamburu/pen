---
"@input/pen-ai": patch
---

Classify question prompts as their own intent and force the edit tool only on an edit-intent pass (EC17). On the tool channel with a forced-choice adapter, "What is this document about?" previously left the model no way to answer except by editing the document.
